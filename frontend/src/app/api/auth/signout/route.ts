import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Signed out successfully." });
  response.cookies.delete("civic_anon_session");
  return response;
}

export async function GET() {
  const response = NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  response.cookies.delete("civic_anon_session");
  return response;
}
