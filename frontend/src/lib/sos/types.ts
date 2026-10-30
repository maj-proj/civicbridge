export type PersonalEmergencyId =
  | "MEDICAL_EMERGENCY"
  | "PHYSICAL_ASSAULT"
  | "ROBBERY_THEFT"
  | "ROAD_ACCIDENT"
  | "FIRE_TRAPPED";

export interface EmergencyOptionConfig {
  id: PersonalEmergencyId;
  title: string;
  shortLabel: string;
  icon: string; // Lucide icon identifier
  severity: "CRITICAL" | "HIGH" | "URGENT";
  responderDept: string;
  defaultEmergencyNumber: string;
  description: string;
  voiceUrgencySummary: string;
}

export const PERSONAL_EMERGENCY_OPTIONS: EmergencyOptionConfig[] = [
  {
    id: "MEDICAL_EMERGENCY",
    title: "Medical Emergency",
    shortLabel: "Ambulance / ICU",
    icon: "HeartPulse",
    severity: "CRITICAL",
    responderDept: "Emergency Medical Services (108 / 112)",
    defaultEmergencyNumber: "108",
    description: "Heart attack, loss of consciousness, severe hemorrhage, or sudden medical collapse.",
    voiceUrgencySummary: "an acute, life-threatening medical emergency requiring immediate ambulance and paramedic intervention",
  },
  {
    id: "PHYSICAL_ASSAULT",
    title: "Assault & Life Threat",
    shortLabel: "Police / PCR Van",
    icon: "ShieldAlert",
    severity: "CRITICAL",
    responderDept: "Police Emergency Patrol (112 / 100)",
    defaultEmergencyNumber: "112",
    description: "Active physical violence, stalking, harassment, or imminent threat to life.",
    voiceUrgencySummary: "an active physical assault and immediate threat to personal safety. The individual may be in grave danger and unable to speak safely",
  },
  {
    id: "ROBBERY_THEFT",
    title: "Theft & Armed Robbery",
    shortLabel: "Police Crime Unit",
    icon: "Siren",
    severity: "HIGH",
    responderDept: "Crime Dispatch (112)",
    defaultEmergencyNumber: "112",
    description: "Armed mugging, burglary in progress, or dangerous theft on scene.",
    voiceUrgencySummary: "an active armed robbery or theft in progress, requiring urgent police intervention",
  },
  {
    id: "ROAD_ACCIDENT",
    title: "Severe Road Accident",
    shortLabel: "Trauma & Traffic",
    icon: "CarFront",
    severity: "CRITICAL",
    responderDept: "Highway Patrol & Trauma Rescue (108 / 112)",
    defaultEmergencyNumber: "108",
    description: "Vehicle crash, hit-and-run, or injured passengers trapped inside wreckage.",
    voiceUrgencySummary: "a severe road vehicular accident with injured or trapped individuals needing immediate trauma care and rescue equipment",
  },
  {
    id: "FIRE_TRAPPED",
    title: "Fire & Trapped Indoors",
    shortLabel: "Fire & Rescue (101)",
    icon: "Flame",
    severity: "CRITICAL",
    responderDept: "Fire & Rescue Control (101 / 112)",
    defaultEmergencyNumber: "101",
    description: "Active structure fire, suffocating smoke inhalation, gas leak, or blocked exit.",
    voiceUrgencySummary: "an active fire outbreak and hazardous smoke situation with persons trapped indoors",
  },
];

export interface CitizenContext {
  isAnonymous: boolean;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface SosCallRequest {
  emergencyType: PersonalEmergencyId;
  latitude: number | null;
  longitude: number | null;
  locationText?: string | null;
}

export interface SosCallResult {
  success: boolean;
  mode: "live" | "sandbox_override" | "dry_run";
  callSid?: string;
  dialedNumber: string;
  emergencyTitle: string;
  responderDept: string;
  citizenName: string;
  speechText: string;
  warning?: string;
  error?: string;
}
