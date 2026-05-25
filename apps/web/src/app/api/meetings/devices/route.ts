import { NextResponse } from "next/server";
import { listAudioDevices } from "../../../../lib/capture/devices";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const devices = await listAudioDevices();
  return NextResponse.json({ devices });
}
