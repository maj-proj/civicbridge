import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const anonCookie = req.cookies.get("civic_anon_session");

    let anonUser = null;
    if (anonCookie?.value) {
      try {
        anonUser = JSON.parse(anonCookie.value);
      } catch {
        anonUser = null;
      }
    }

    const hasClerkKey = Boolean(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith("pk_") &&
        !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes("placeholder")
    );

    return NextResponse.json({
      authenticated: Boolean(anonUser),
      mode: anonUser ? "anonymous" : "none",
      user: anonUser,
      databaseConfigured: isDatabaseConfigured(),
      clerkConfigured: hasClerkKey,
    });
  } catch (err: unknown) {
    console.error("Session fetch error:", err);
    return NextResponse.json({ authenticated: false, error: "Failed to get session" });
  }
}
