"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import AgoraRTC, {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import {
  loadCastLabSDK,
  CastLabSDK,
  CastLabDrmConfig,
  patchRTCPeerConnection,
  onTrackCaptured,
} from "@/lib/castlab";

AgoraRTC.setLogLevel(4);

// Patch RTCPeerConnection BEFORE Agora creates any — this injects encodedInsertableStreams
patchRTCPeerConnection();

interface VideoCallProps {
  config: { appId: string; channel: string; token: string };
  onLeave: () => void;
}

export default function VideoCall({ config, onLeave }: VideoCallProps) {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localVideoRef = useRef<HTMLDivElement>(null);
  const [localTracks, setLocalTracks] = useState<{
    video: ICameraVideoTrack | null;
    audio: IMicrophoneAudioTrack | null;
  }>({ video: null, audio: null });
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [castlab, setCastlab] = useState<CastLabSDK | null>(null);
  // Only keep one remote video track (deduplicate across Agora's multiple PeerConnections)
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<RTCTrackEvent | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Load CastLab SDK
  useEffect(() => {
    loadCastLabSDK()
      .then((sdk) => {
        console.log(`CastLab DRM SDK v${sdk.rtcDrmGetVersion()} loaded`);
        setCastlab(sdk);
      })
      .catch((err) => console.error("Failed to load CastLab SDK:", err));
  }, []);

  // Listen for captured remote tracks — this drives rendering independently of Agora events
  useEffect(() => {
    const cleanup = onTrackCaptured((event) => {
      if (event.track.kind === "video") {
        console.log(`[DRM] New remote video track: ${event.track.id}`);
        // Only use the first video track — ignore duplicates from multiple PeerConnections
        setRemoteVideoTrack((prev) => {
          if (prev && prev.track.readyState === "live") {
            console.log(`[DRM] Ignoring duplicate video track, already have one`);
            return prev;
          }
          return event;
        });
        event.track.onended = () => {
          console.log(`[DRM] Video track ended: ${event.track.id}`);
          setRemoteVideoTrack((prev) =>
            prev?.track.id === event.track.id ? null : prev
          );
        };
      } else if (event.track.kind === "audio") {
        console.log(`[DRM] New remote audio track: ${event.track.id}`);
        const stream = new MediaStream([event.track]);
        const audio = new Audio();
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.play().catch((err) => console.warn("Audio autoplay failed:", err));
        audioElementsRef.current.set(event.track.id, audio);
        event.track.onended = () => {
          console.log(`[DRM] Audio track ended: ${event.track.id}`);
          audio.pause();
          audio.srcObject = null;
          audioElementsRef.current.delete(event.track.id);
        };
      }
    });

    return () => {
      cleanup();
      audioElementsRef.current.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
      });
      audioElementsRef.current.clear();
    };
  }, []);

  // Join channel
  useEffect(() => {
    let mounted = true;

    async function init() {
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "h264" });
      clientRef.current = client;

      await client.join(
        config.appId,
        config.channel,
        config.token || null,
        null
      );
      console.log("[Agora] Joined channel:", config.channel);

      // Subscribe to trigger SDP negotiation — media rendering is handled by captured track events
      client.on("user-published", (user, mediaType) => {
        console.log(`[Agora] user-published: uid=${user.uid}, type=${mediaType}`);
        client.subscribe(user, mediaType).catch((err) => {
          console.warn(`[Agora] Subscribe failed for ${user.uid} ${mediaType}:`, err);
        });
      });

      const [micTrack, camTrack] =
        await AgoraRTC.createMicrophoneAndCameraTracks();

      if (!mounted) {
        micTrack.close();
        camTrack.close();
        return;
      }

      setLocalTracks({ video: camTrack, audio: micTrack });

      if (localVideoRef.current) {
        camTrack.play(localVideoRef.current);
      }

      await client.publish([micTrack, camTrack]);
      console.log("[Agora] Published local tracks");
    }

    init().catch(console.error);

    return () => {
      mounted = false;
    };
  }, [config]);

  const leave = useCallback(async () => {
    localTracks.video?.close();
    localTracks.audio?.close();
    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    audioElementsRef.current.clear();
    await clientRef.current?.leave();
    clientRef.current = null;
    onLeave();
  }, [localTracks, onLeave]);

  const toggleAudio = async () => {
    if (localTracks.audio) {
      await localTracks.audio.setEnabled(audioMuted);
      setAudioMuted(!audioMuted);
    }
  };

  const toggleVideo = async () => {
    if (localTracks.video) {
      await localTracks.video.setEnabled(videoMuted);
      setVideoMuted(!videoMuted);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      {/* Video grid */}
      <div className="flex flex-1 flex-wrap items-center justify-center gap-4 p-4">
        {/* Local video */}
        <div className="relative aspect-video w-full max-w-lg overflow-hidden rounded-xl bg-zinc-800">
          <div ref={localVideoRef} className="h-full w-full" />
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
            You {videoMuted && "(camera off)"}
          </span>
        </div>

        {/* Remote DRM-protected video — driven by captured track event */}
        {remoteVideoTrack && (
          <DrmVideo
            key={remoteVideoTrack.track.id}
            trackEvent={remoteVideoTrack}
            castlab={castlab}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 border-t border-zinc-800 p-4">
        <ControlButton
          active={audioMuted}
          onClick={toggleAudio}
          icon={audioMuted ? "mic-off" : "mic"}
        />
        <ControlButton
          active={videoMuted}
          onClick={toggleVideo}
          icon={videoMuted ? "video-off" : "video"}
        />
        <button
          onClick={leave}
          className="rounded-full bg-red-600 p-4 transition-colors hover:bg-red-700"
        >
          <PhoneIcon />
        </button>
      </div>
    </div>
  );
}

function DrmVideo({
  trackEvent,
  castlab,
}: {
  trackEvent: RTCTrackEvent;
  castlab: CastLabSDK | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const initializedRef = useRef(false);
  const [drmActive, setDrmActive] = useState(false);
  const [drmError, setDrmError] = useState<string | null>(null);

  useEffect(() => {
    if (!castlab || !videoRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const videoEl = videoRef.current;

    console.log(`[DRM] Setting up DRM for track ${trackEvent.track.id}`);

    const crt = {
      profile: { purchase: {} },
      outputProtection: {
        digital: true,
        analogue: true,
        enforce: true,
      },
    };

    const drmConfig: CastLabDrmConfig = {
      merchant: "2a4fa76e0ee14fa78cc808ef8f16ef38",
      environment: castlab.rtcDrmEnvironments.Production,
      videoElement: videoEl,
      sessionId: `crtjson:${JSON.stringify(crt)}`,
      video: {
        codec: "H264",
        encryption: "cenc",
      },
      mediaBufferMs: 500,
      logLevel: 4,
    };

    // Listen for DRM errors
    const errorHandler = ((event: CustomEvent) => {
      const msg = event.detail?.message || "DRM error";
      console.error("CastLab DRM error:", msg);
      setDrmError(msg);
    }) as EventListener;
    videoEl.addEventListener("rtcdrmerror", errorHandler);

    try {
      castlab.rtcDrmConfigure(drmConfig);
      castlab.rtcDrmOnTrack(trackEvent, drmConfig);
      castlab.rtcDrmSetBufferSize(drmConfig, 500);
      setDrmActive(true);
      console.log(`[DRM] DRM configured and track routed for ${trackEvent.track.id}`);
      // Ensure video element starts playing
      videoEl.play().catch(() => {});
    } catch (err) {
      console.error("Failed to set up CastLab DRM:", err);
      setDrmError(String(err));

      // Fallback: play track directly without DRM
      videoEl.srcObject = new MediaStream([trackEvent.track]);
    }

    return () => {
      videoEl.removeEventListener("rtcdrmerror", errorHandler);
    };
  }, [castlab, trackEvent]);

  return (
    <div className="relative aspect-video w-full max-w-lg overflow-hidden rounded-xl bg-zinc-800">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-cover"
      />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
        Remote
      </span>
      {drmActive && (
        <span className="absolute top-2 right-2 rounded bg-green-600/80 px-2 py-1 text-xs text-white">
          DRM Protected
        </span>
      )}
      {drmError && (
        <span className="absolute top-2 left-2 rounded bg-red-600/80 px-2 py-1 text-xs text-white">
          {drmError}
        </span>
      )}
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full p-4 transition-colors ${
        active
          ? "bg-red-600 hover:bg-red-700"
          : "bg-zinc-700 hover:bg-zinc-600"
      }`}
    >
      {icon === "mic" && <MicIcon />}
      {icon === "mic-off" && <MicOffIcon />}
      {icon === "video" && <VideoIcon />}
      {icon === "video-off" && <VideoOffIcon />}
    </button>
  );
}

// SVG Icons
function MicIcon() {
  return (
    <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function VideoOffIcon() {
  return (
    <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
    </svg>
  );
}
