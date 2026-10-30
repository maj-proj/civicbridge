import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmergencySpeechText,
  buildTwimlXml,
  getEmergencyOption,
} from "./speechPrompt";
import { PERSONAL_EMERGENCY_OPTIONS } from "./types";

test("buildEmergencySpeechText for authenticated user with coordinates", () => {
  const option = getEmergencyOption("MEDICAL_EMERGENCY");
  const speech = buildEmergencySpeechText({
    option,
    citizen: {
      isAnonymous: false,
      name: "Ritabrata Ghosh",
      phone: "+919876543210",
      email: "test@example.com",
    },
    latitude: 12.9345,
    longitude: 77.6231,
    locationText: "80 Feet Road, 4th Block, Bengaluru",
  });

  assert.ok(speech.includes("Ritabrata Ghosh"), "Should mention citizen's name");
  assert.ok(speech.includes("+919876543210"), "Should mention phone number");
  assert.ok(speech.includes("Medical Emergency"), "Should state emergency title");
  assert.ok(speech.includes("80 Feet Road"), "Should state address");
  assert.ok(speech.includes("12.9345"), "Should state latitude");
  assert.ok(speech.includes("77.6231"), "Should state longitude");
});

test("buildEmergencySpeechText for anonymous user", () => {
  const option = getEmergencyOption("PHYSICAL_ASSAULT");
  const speech = buildEmergencySpeechText({
    option,
    citizen: {
      isAnonymous: true,
      name: "Anonymous Citizen",
      email: null,
      phone: null,
    },
    latitude: 12.9716,
    longitude: 77.5946,
  });

  assert.ok(speech.includes("Anonymous Citizen"), "Should address as Anonymous Citizen");
  assert.ok(!speech.includes("Ritabrata"), "Should not leak other names");
  assert.ok(speech.includes("Assault & Life Threat"), "Should mention assault emergency");
  assert.ok(speech.includes("12.9716"), "Should contain latitude coordinates");
});

test("buildTwimlXml produces valid TwiML with Polly voice", () => {
  const xml = buildTwimlXml("Emergency priority alert test");
  assert.ok(xml.includes("<Response>"), "Must have <Response> tag");
  assert.ok(xml.includes("<Say voice=\"Polly.Aditi\" language=\"en-IN\">"), "Must specify Polly.Aditi en-IN voice");
  assert.ok(xml.includes("<Hangup/>"), "Must hangup after prompt");
});

test("All 5 personal emergency options have valid configurations", () => {
  assert.equal(PERSONAL_EMERGENCY_OPTIONS.length, 5, "Must have exactly 5 options");
  for (const opt of PERSONAL_EMERGENCY_OPTIONS) {
    assert.ok(opt.id, "Option must have an ID");
    assert.ok(opt.title, "Option must have a title");
    assert.ok(opt.responderDept, "Option must have a responder department");
    assert.ok(opt.voiceUrgencySummary, "Option must have an urgency summary");
  }
});
