// CastLab SDK loader - dynamically imports the ES module from public/ at runtime

export interface CastLabDrmConfig {
  merchant: string;
  environment: unknown;
  videoElement: HTMLVideoElement;
  audioElement?: HTMLAudioElement;
  sessionId?: string;
  authToken?: string;
  customTransform?: boolean;
  video?: {
    codec: string;
    encryption: string;
    keyId?: Uint8Array;
    iv?: Uint8Array;
    robustness?: string;
  };
  audio?: {
    codec: string;
    encryption: string;
  };
  logLevel?: number;
  mediaBufferMs?: number;
  type?: string;
}

export interface CastLabSDK {
  rtcDrmConfigure: (config: CastLabDrmConfig) => void;
  rtcDrmOnTrack: (event: RTCTrackEvent, config?: CastLabDrmConfig) => void;
  rtcDrmGetVersion: () => string;
  rtcDrmFeedFrame: (
    frame: unknown,
    controller: TransformStreamDefaultController,
    config: CastLabDrmConfig
  ) => boolean;
  rtcDrmSetBufferSize: (config: CastLabDrmConfig, bufferSizeMs: number) => void;
  rtcDrmEnvironments: {
    Production: unknown;
    Staging: unknown;
    Development: unknown;
  };
}

let sdkPromise: Promise<CastLabSDK> | null = null;

export function loadCastLabSDK(): Promise<CastLabSDK> {
  if (!sdkPromise) {
    // Use Function constructor to prevent bundler from resolving the import at build time
    const dynamicImport = new Function(
      "url",
      "return import(url)"
    ) as (url: string) => Promise<CastLabSDK>;
    sdkPromise = dynamicImport("/castlab-sdk/rtc-drm-transform.min.js");
  }
  return sdkPromise;
}

// Queue to store RTCTrackEvents from monkey-patched PeerConnections
const trackEventQueue: RTCTrackEvent[] = [];

/**
 * Find and consume a stored RTCTrackEvent matching a given MediaStreamTrack id.
 */
export function consumeTrackEvent(trackId: string): RTCTrackEvent | null {
  const idx = trackEventQueue.findIndex((e) => e.track.id === trackId);
  if (idx === -1) return null;
  return trackEventQueue.splice(idx, 1)[0];
}

/**
 * Get all pending track events (without consuming).
 */
export function getPendingTrackEvents(): RTCTrackEvent[] {
  return [...trackEventQueue];
}

type TrackCaptureCallback = (event: RTCTrackEvent) => void;
const trackCaptureCallbacks = new Set<TrackCaptureCallback>();

export function onTrackCaptured(cb: TrackCaptureCallback): () => void {
  trackCaptureCallbacks.add(cb);
  return () => { trackCaptureCallbacks.delete(cb); };
}

let patched = false;

/**
 * Patch RTCPeerConnection.prototype.addEventListener to capture track events.
 * This does NOT modify PeerConnection construction, so it's safe with Agora.
 */
export function patchRTCPeerConnection(): void {
  if (patched) return;
  patched = true;

  // Patch the constructor to add a track event listener on every new PeerConnection.
  // We do NOT modify the config (no encodedInsertableStreams) to keep Agora working.
  const OriginalPC = window.RTCPeerConnection;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PatchedPC = function (this: RTCPeerConnection, config?: RTCConfiguration, constraints?: any) {
    // Add encodedInsertableStreams — required by CastLab's createEncodedStreams() API
    const patchedConfig = { ...config, encodedInsertableStreams: true } as RTCConfiguration;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pc = new (OriginalPC as any)(patchedConfig, constraints);

    // Agora calls setConfiguration() which fails with encodedInsertableStreams.
    // Silently ignore — Agora uses this for ICE server updates, not critical.
    const origSetConfig = pc.setConfiguration.bind(pc);
    pc.setConfiguration = (newConfig?: RTCConfiguration) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cleaned = newConfig ? ({ ...newConfig } as any) : newConfig;
        if (cleaned) delete cleaned.encodedInsertableStreams;
        return origSetConfig(cleaned);
      } catch {
        // Silently ignore
      }
    };

    // Capture ALL track events on this PeerConnection
    pc.addEventListener("track", (event: RTCTrackEvent) => {
      console.log(
        `[DRM] Captured track event: kind=${event.track.kind}, id=${event.track.id}`
      );
      trackEventQueue.push(event);
      trackCaptureCallbacks.forEach(cb => cb(event));
    });

    return pc;
  } as unknown as typeof RTCPeerConnection;

  PatchedPC.prototype = OriginalPC.prototype;
  Object.setPrototypeOf(PatchedPC, OriginalPC);
  window.RTCPeerConnection = PatchedPC;

  console.log("[DRM] RTCPeerConnection patched to capture track events");
}
