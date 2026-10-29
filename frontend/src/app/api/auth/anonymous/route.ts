import { NextRequest, NextResponse } from "next/server";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Fallback in-memory store in case Neon DB is not yet connected via .env.local
const fallbackUsers = new Map<
  string,
  { id: string; username: string; role: string; createdAt: Date; lastActive: Date }
>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawUsername = body?.username;

    if (!rawUsername || typeof rawUsername !== "string") {
      return NextResponse.json(
        { error: "A unique username is required for anonymous access." },
        { status: 400 }
      );
    }

    const username = rawUsername.trim();

    // Validate username format
    if (username.length < 3 || username.length > 30) {
      return NextResponse.json(
        { error: "Username must be between 3 and 30 characters long." },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_\-\.]+$/.test(username)) {
      return NextResponse.json(
        {
          error:
            "Username can only contain letters, numbers, underscores, dashes, and periods.",
        },
        { status: 400 }
      );
    }

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || undefined;

    let userRecord: {
      id: string;
      username: string;
      role: string;
      createdAt: Date;
      lastActive: Date;
    };
    let isDbSaved = false;

    if (isDatabaseConfigured()) {
      try {
        // Query or upsert in Neon DB PostgreSQL via Prisma
        const existing = await prisma.anonymousUser.findUnique({
          where: { username },
        });

        if (existing) {
          // User exists, update lastActive and log them in
          userRecord = await prisma.anonymousUser.update({
            where: { id: existing.id },
            data: {
              lastActive: new Date(),
              ipAddress: clientIp,
              userAgent,
            },
          });
        } else {
          // Register new unique anonymous user
          userRecord = await prisma.anonymousUser.create({
            data: {
              username,
              role: "ANONYMOUS",
              ipAddress: clientIp,
              userAgent,
            },
          });
        }
        isDbSaved = true;
      } catch (dbError: unknown) {
        console.error("Neon DB error, falling back to local session:", dbError);
        // If DB table not migrated or network error, fallback gracefully
        const existing = fallbackUsers.get(username);
        if (existing) {
          existing.lastActive = new Date();
          userRecord = existing;
        } else {
          userRecord = {
            id: `anon_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            username,
            role: "ANONYMOUS",
            createdAt: new Date(),
            lastActive: new Date(),
          };
          fallbackUsers.set(username, userRecord);
        }
      }
    } else {
      // Database URL not configured yet
      const existing = fallbackUsers.get(username);
      if (existing) {
        existing.lastActive = new Date();
        userRecord = existing;
      } else {
        userRecord = {
          id: `anon_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          username,
          role: "ANONYMOUS",
          createdAt: new Date(),
          lastActive: new Date(),
        };
        fallbackUsers.set(username, userRecord);
      }
    }

    const sessionPayload = {
      id: userRecord.id,
      username: userRecord.username,
      role: userRecord.role,
      type: "anonymous",
      createdAt: userRecord.createdAt,
      lastActive: userRecord.lastActive,
      isDbSaved,
    };

    const response = NextResponse.json({
      success: true,
      message: `Authenticated as anonymous user @${userRecord.username}`,
      user: sessionPayload,
      databaseConnected: isDbSaved,
    });

    // Set HTTP-only session cookie
    response.cookies.set("civic_anon_session", JSON.stringify(sessionPayload), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    console.error("Anonymous authentication error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during anonymous login." },
      { status: 500 }
    );
  }
}
