import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import {
  PersonalEmergencyId,
  CitizenContext,
} from "@/lib/sos/types";
import { getEmergencyOption } from "@/lib/sos/speechPrompt";
import { initiateSosCall } from "@/lib/sos/twilioClient";
import { reverseGeocode } from "@/lib/geo/reverseGeocode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readAnonymousSession(req: NextRequest): { username?: string } | null {
  const cookie = req.cookies.get("civic_anon_session");
  if (!cookie?.value) return null;
  try {
    return JSON.parse(cookie.value);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const emergencyType = body.emergencyType as PersonalEmergencyId;
    const latitude = typeof body.latitude === "number" ? body.latitude : null;
    const longitude = typeof body.longitude === "number" ? body.longitude : null;
    let locationText = typeof body.locationText === "string" ? body.locationText.trim() : null;

    if (!emergencyType) {
      return NextResponse.json(
        { error: "Missing required emergencyType field." },
        { status: 400 }
      );
    }

    // Determine citizen context (Authenticated vs Anonymous)
    let citizen: CitizenContext = {
      isAnonymous: true,
      name: "Anonymous Citizen",
      email: null,
      phone: null,
    };

    // 1. Try Clerk authentication
    try {
      const clerkUser = await currentUser();
      if (clerkUser) {
        const fullName =
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
          clerkUser.username ||
          null;

        const email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
        const phone = clerkUser.phoneNumbers?.[0]?.phoneNumber || null;

        if (fullName) {
          citizen = {
            isAnonymous: false,
            name: fullName,
            email,
            phone,
          };
        }
      }
    } catch {
      // Clerk is optional; anonymous fallback will handle
    }

    // 2. If Clerk was not authenticated or name missing, check anonymous session
    if (citizen.isAnonymous) {
      const anon = readAnonymousSession(req);
      if (anon?.username && !anon.username.toLowerCase().includes("anon")) {
        citizen = {
          isAnonymous: false,
          name: anon.username,
          email: null,
          phone: null,
        };
      }
    }

    // If coordinates are present but locationText is missing, reverse geocode to get street address
    if ((!locationText || locationText === "") && latitude !== null && longitude !== null) {
      try {
        const geo = await reverseGeocode(latitude, longitude);
        if (geo.address) {
          locationText = geo.address;
        } else if (geo.wardName) {
          locationText = `${geo.wardName}${geo.city ? `, ${geo.city}` : ""}`;
        }
      } catch (geoErr) {
        console.warn("Reverse geocode failed during SOS dispatch:", geoErr);
      }
    }

    const option = getEmergencyOption(emergencyType);

    const callResult = await initiateSosCall({
      option,
      citizen,
      latitude,
      longitude,
      locationText,
    });

    return NextResponse.json({
      ...callResult,
      citizen,
    });
  } catch (error) {
    console.error("SOS Call Route Handler Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error while processing emergency SOS call.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
