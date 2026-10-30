import { NextRequest, NextResponse } from "next/server";
import { buildTwimlXml } from "@/lib/sos/speechPrompt";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Query param speech or default message
  const url = new URL(req.url);
  const speech = url.searchParams.get("speech") || "Emergency Priority Alert from CivicBridge SOS Dispatch.";
  const xml = buildTwimlXml(speech);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
    },
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
