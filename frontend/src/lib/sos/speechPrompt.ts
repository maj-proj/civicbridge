import {
  EmergencyOptionConfig,
  CitizenContext,
  PERSONAL_EMERGENCY_OPTIONS,
  PersonalEmergencyId,
} from "./types";

export interface SpeechContextInput {
  option: EmergencyOptionConfig;
  citizen: CitizenContext;
  latitude: number | null;
  longitude: number | null;
  locationText?: string | null;
}

export function buildEmergencySpeechText(input: SpeechContextInput): string {
  const { option, citizen, latitude, longitude, locationText } = input;

  const identityClause = citizen.isAnonymous
    ? "an Anonymous Citizen who is in acute distress at the scene"
    : `citizen ${citizen.name}${citizen.phone ? ` with registered contact number ${citizen.phone}` : ""}`;

  let locationClause = "";
  if (locationText && locationText.trim()) {
    locationClause += `Location address: ${locationText.trim()}. `;
  }

  if (typeof latitude === "number" && typeof longitude === "number" && !isNaN(latitude) && !isNaN(longitude)) {
    locationClause += `Coordinates: ${Math.abs(latitude).toFixed(4)} degrees ${latitude >= 0 ? "North" : "South"}, ${Math.abs(longitude).toFixed(4)} degrees ${longitude >= 0 ? "East" : "West"}.`;
  } else if (!locationClause) {
    locationClause = "Location coordinates could not be retrieved from the device.";
  }

  const message = [
    `Emergency priority alert from CivicBridge SOS Dispatch.`,
    `This is an automated emergency call on behalf of ${identityClause}.`,
    `A critical ${option.title} has just been triggered.`,
    `Situation report: The person is facing ${option.voiceUrgencySummary}.`,
    locationClause,
    `Please dispatch nearest ${option.responderDept} emergency units immediately.`,
    `Repeating emergency details now:`,
    `${option.title} at ${locationClause}. Dispatch immediately.`,
  ].join(" ");

  return message;
}

export function buildTwimlXml(speechText: string): string {
  // Use Amazon Polly Indian English voice for natural pronunciation of Indian addresses and names
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Aditi" language="en-IN">${escapeXml(speechText)}</Say>
  <Pause length="2"/>
  <Say voice="Polly.Aditi" language="en-IN">End of CivicBridge Emergency SOS alert. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function getEmergencyOption(id: PersonalEmergencyId): EmergencyOptionConfig {
  const found = PERSONAL_EMERGENCY_OPTIONS.find((opt) => opt.id === id);
  if (!found) {
    return PERSONAL_EMERGENCY_OPTIONS[0];
  }
  return found;
}
