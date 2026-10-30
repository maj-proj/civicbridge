import twilio from "twilio";
import {
  EmergencyOptionConfig,
  CitizenContext,
  SosCallResult,
} from "./types";
import { buildEmergencySpeechText, buildTwimlXml } from "./speechPrompt";

export interface InitiateSosCallParams {
  option: EmergencyOptionConfig;
  citizen: CitizenContext;
  latitude: number | null;
  longitude: number | null;
  locationText?: string | null;
}

export async function initiateSosCall(params: InitiateSosCallParams): Promise<SosCallResult> {
  const { option, citizen, latitude, longitude, locationText } = params;

  const speechText = buildEmergencySpeechText({
    option,
    citizen,
    latitude,
    longitude,
    locationText,
  });

  const twimlXml = buildTwimlXml(speechText);

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  const overrideNumber = process.env.SOS_EMERGENCY_OVERRIDE_PHONE?.trim();

  const targetNumber: string = overrideNumber || option.defaultEmergencyNumber || "112";

  const isConfigured = Boolean(
    accountSid &&
    authToken &&
    fromNumber &&
    accountSid.startsWith("AC") &&
    !accountSid.includes("your_")
  );

  if (!isConfigured || !fromNumber) {
    console.log("[SOS Voice Dispatch - DRY RUN / SIMULATION]");
    console.log(`Dialing Target: ${targetNumber} (${option.responderDept})`);
    console.log(`Citizen: ${citizen.name} (Anonymous: ${citizen.isAnonymous})`);
    console.log(`Announcement Speech:\n"${speechText}"\n`);

    return {
      success: true,
      mode: "dry_run",
      dialedNumber: targetNumber,
      emergencyTitle: option.title,
      responderDept: option.responderDept,
      citizenName: citizen.name,
      speechText,
      warning:
        "Twilio credentials not configured. The emergency dispatch call was simulated in Dry Run mode.",
    };
  }

  try {
    const client = twilio(accountSid, authToken);

    // Twilio supports directly supplying the TwiML XML string in calls.create!
    // This allows calls to execute without requiring a public reverse tunnel / ngrok.
    const call = await client.calls.create({
      twiml: twimlXml,
      to: targetNumber,
      from: fromNumber,
    });

    console.log(`[SOS Twilio Call Initiated] SID: ${call.sid}, Status: ${call.status}, To: ${targetNumber}`);

    return {
      success: true,
      mode: overrideNumber ? "sandbox_override" : "live",
      callSid: call.sid,
      dialedNumber: targetNumber,
      emergencyTitle: option.title,
      responderDept: option.responderDept,
      citizenName: citizen.name,
      speechText,
    };
  } catch (error) {
    console.error("Twilio Emergency Call Failed:", error);
    const errMessage = error instanceof Error ? error.message : "Twilio call execution failed";
    return {
      success: false,
      mode: overrideNumber ? "sandbox_override" : "live",
      dialedNumber: targetNumber,
      emergencyTitle: option.title,
      responderDept: option.responderDept,
      citizenName: citizen.name,
      speechText,
      error: errMessage,
    };
  }
}
