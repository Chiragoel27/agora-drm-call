"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

const VideoCall = dynamic(() => import("@/components/VideoCall"), {
  ssr: false,
});

export default function Home() {
  const [joinConfig, setJoinConfig] = useState<{
    appId: string;
    channel: string;
    token: string;
  } | null>(null);
  const [formData, setFormData] = useState({
    appId: "7441ab9ba1db4e388c88a74586c63a5c",
    channel: "test123",
  });

  const [joining, setJoining] = useState(false);

  const handleJoin = useCallback(async () => {
    if (!formData.appId || !formData.channel) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/token?channel=${encodeURIComponent(formData.channel)}`);
      const data = await res.json();
      setJoinConfig({
        appId: formData.appId,
        channel: formData.channel,
        token: data.token || "",
      });
    } catch (err) {
      console.error("Failed to fetch token:", err);
      setJoinConfig({
        appId: formData.appId,
        channel: formData.channel,
        token: "",
      });
    } finally {
      setJoining(false);
    }
  }, [formData.appId, formData.channel]);

  if (joinConfig) {
    return <VideoCall config={joinConfig} onLeave={() => setJoinConfig(null)} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 p-8 shadow-2xl">
        <h1 className="mb-6 text-2xl font-semibold text-white">
          Join Video Call
        </h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleJoin();
          }}
          className="flex flex-col gap-4"
        >
          <input
            type="text"
            placeholder="Agora App ID"
            value={formData.appId}
            onChange={(e) => setFormData({ ...formData, appId: e.target.value })}
            className="rounded-lg bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <input
            type="text"
            placeholder="Channel Name"
            value={formData.channel}
            onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
            className="rounded-lg bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <button
            type="submit"
            disabled={joining}
            className="mt-2 rounded-lg bg-blue-600 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {joining ? "Joining..." : "Join"}
          </button>
        </form>
      </div>
    </div>
  );
}
