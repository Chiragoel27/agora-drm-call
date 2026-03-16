import { NextRequest, NextResponse } from "next/server";
import { RtcTokenBuilder, RtcRole } from "agora-token";

const APP_ID = process.env.AGORA_APP_ID || "";
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || "";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const channel = searchParams.get("channel");

  if (!channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  const uid = 0; // 0 means any uid can use this token
  const role = RtcRole.PUBLISHER;
  const expireTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expireTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    channel,
    uid,
    role,
    expireTimeInSeconds,
    privilegeExpiredTs
  );

  return NextResponse.json({ token });
}
