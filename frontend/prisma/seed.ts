/**
 * Seeds the authority routing table and the sensitive-zone map.
 *
 * The email addresses below are the REAL intended recipients. Nothing is
 * delivered to them unless EMAIL_MODE=live AND EMAIL_ALLOW_LIVE=true — see
 * src/lib/email/send.ts. Keeping the genuine addresses here (rather than
 * substituting a personal inbox) is deliberate: it means the routing logic is
 * actually exercised during a demo instead of being short-circuited by the data.
 *
 * Run with:  npx prisma db seed
 */
import { PrismaClient, Department, ZoneType } from "@prisma/client";
import BANGALORE_ZONES from "./data/bangalore-zones.json";

const prisma = new PrismaClient();

const CITY = "Bengaluru";

async function main() {
  console.log("Clearing existing authorities and sensitive zones...");
  // Reports reference authorities, so detach before deleting.
  await prisma.civicReport.updateMany({ data: { authorityId: null } });
  await prisma.authority.deleteMany({});
  await prisma.sensitiveZone.deleteMany({});

  // -------------------------------------------------------------------------
  // Tier 3 — city level (final escalation)
  // -------------------------------------------------------------------------
  const commissioner = await prisma.authority.create({
    data: {
      name: "BBMP Office of the Chief Commissioner",
      designation: "Chief Commissioner",
      department: Department.GENERAL,
      city: CITY,
      email: "comm@bbmp.gov.in",
      ccEmails: [],
      phone: "080-22660000",
      escalationTier: 3,
      centroidLat: 12.9716,
      centroidLng: 77.5946,
      radiusMeters: 40000,
    },
  });

  const pollutionBoard = await prisma.authority.create({
    data: {
      name: "Karnataka State Pollution Control Board",
      designation: "Environmental Officer",
      department: Department.POLLUTION_CONTROL,
      city: CITY,
      email: "ksprb.bengaluru@kspcb.gov.in",
      ccEmails: [],
      escalationTier: 3,
      centroidLat: 12.9716,
      centroidLng: 77.5946,
      radiusMeters: 40000,
    },
  });

  const healthOfficer = await prisma.authority.create({
    data: {
      name: "BBMP Public Health Department",
      designation: "Chief Health Officer",
      department: Department.HEALTH,
      city: CITY,
      email: "health@bbmp.gov.in",
      ccEmails: [],
      escalationTier: 3,
      centroidLat: 12.9716,
      centroidLng: 77.5946,
      radiusMeters: 40000,
    },
  });

  const waterBoard = await prisma.authority.create({
    data: {
      name: "Bangalore Water Supply and Sewerage Board",
      designation: "Executive Engineer",
      department: Department.WATER,
      city: CITY,
      email: "info@bwssb.gov.in",
      ccEmails: [],
      escalationTier: 3,
      centroidLat: 12.9716,
      centroidLng: 77.5946,
      radiusMeters: 40000,
    },
  });

  // -------------------------------------------------------------------------
  // Tier 2 — zonal
  // -------------------------------------------------------------------------
  const bommanahalliZone = await prisma.authority.create({
    data: {
      name: "BBMP Bommanahalli Zonal Office",
      designation: "Joint Commissioner (Bommanahalli)",
      department: Department.SANITATION,
      zone: "Bommanahalli",
      city: CITY,
      email: "jointcommr.bommanahalli@bbmp.gov.in",
      ccEmails: ["solidwaste.bommanahalli@bbmp.gov.in"],
      escalationTier: 2,
      parentAuthorityId: commissioner.id,
      centroidLat: 12.8995,
      centroidLng: 77.6236,
      radiusMeters: 9000,
    },
  });

  const southZone = await prisma.authority.create({
    data: {
      name: "BBMP South Zonal Office",
      designation: "Joint Commissioner (South)",
      department: Department.SANITATION,
      zone: "South",
      city: CITY,
      email: "jointcommr.south@bbmp.gov.in",
      ccEmails: [],
      escalationTier: 2,
      parentAuthorityId: commissioner.id,
      centroidLat: 12.9250,
      centroidLng: 77.5830,
      radiusMeters: 9000,
    },
  });

  // -------------------------------------------------------------------------
  // Tier 1 — ward level (the default routing target)
  // -------------------------------------------------------------------------
  const wards = [
    {
      name: "BBMP Ward Office - HSR Layout",
      designation: "Assistant Executive Engineer",
      wardName: "HSR Layout",
      wardCode: "W174",
      zone: "Bommanahalli",
      email: "aee.hsrlayout@bbmp.gov.in",
      ccEmails: ["swm.hsrlayout@bbmp.gov.in"],
      lat: 12.9116,
      lng: 77.6412,
      radius: 3500,
      parent: bommanahalliZone.id,
    },
    {
      name: "BBMP Ward Office - Bellandur",
      designation: "Assistant Executive Engineer",
      wardName: "Bellandur",
      wardCode: "W150",
      zone: "Bommanahalli",
      email: "aee.bellandur@bbmp.gov.in",
      ccEmails: [],
      lat: 12.9304,
      lng: 77.6784,
      radius: 4000,
      parent: bommanahalliZone.id,
    },
    {
      name: "BBMP Ward Office - Koramangala",
      designation: "Assistant Executive Engineer",
      wardName: "Koramangala",
      wardCode: "W151",
      zone: "South",
      email: "aee.koramangala@bbmp.gov.in",
      ccEmails: [],
      lat: 12.9352,
      lng: 77.6245,
      radius: 3000,
      parent: southZone.id,
    },
    {
      name: "BBMP Ward Office - BTM Layout",
      designation: "Assistant Executive Engineer",
      wardName: "BTM Layout",
      wardCode: "W176",
      zone: "Bommanahalli",
      email: "aee.btmlayout@bbmp.gov.in",
      ccEmails: [],
      lat: 12.9166,
      lng: 77.6101,
      radius: 3000,
      parent: bommanahalliZone.id,
    },
    {
      name: "BBMP Ward Office - Jayanagar",
      designation: "Assistant Executive Engineer",
      wardName: "Jayanagar",
      wardCode: "W170",
      zone: "South",
      email: "aee.jayanagar@bbmp.gov.in",
      ccEmails: [],
      lat: 12.9299,
      lng: 77.5826,
      radius: 3000,
      parent: southZone.id,
    },
  ];

  for (const w of wards) {
    await prisma.authority.create({
      data: {
        name: w.name,
        designation: w.designation,
        department: Department.SANITATION,
        wardName: w.wardName,
        wardCode: w.wardCode,
        zone: w.zone,
        city: CITY,
        email: w.email,
        ccEmails: w.ccEmails,
        escalationTier: 1,
        parentAuthorityId: w.parent,
        centroidLat: w.lat,
        centroidLng: w.lng,
        radiusMeters: w.radius,
      },
    });
  }

  console.log(
    `Seeded ${wards.length + 6} authorities ` +
      `(city tier: ${[commissioner, pollutionBoard, healthOfficer, waterBoard]
        .map((a) => a.department)
        .join(", ")}).`
  );

  // -------------------------------------------------------------------------
  // Sensitive zones — drive the priority multiplier
  // -------------------------------------------------------------------------
  const zones: Array<{
    name: string;
    type: ZoneType;
    lat: number;
    lng: number;
    radius: number;
    weight: number;
  }> = [
    // Hospitals (highest weight: infection and vector risk)
    { name: "Narayana Multispeciality Hospital, HSR", type: ZoneType.HOSPITAL, lat: 12.9121, lng: 77.6446, radius: 400, weight: 1.6 },
    { name: "Apollo Clinic, Bellandur", type: ZoneType.HOSPITAL, lat: 12.9290, lng: 77.6760, radius: 350, weight: 1.6 },
    { name: "St. John's Medical College Hospital", type: ZoneType.HOSPITAL, lat: 12.9299, lng: 77.6209, radius: 500, weight: 1.6 },

    // Schools
    { name: "Gear Innovative International School", type: ZoneType.SCHOOL, lat: 12.9089, lng: 77.6500, radius: 350, weight: 1.5 },
    { name: "National Public School, HSR Layout", type: ZoneType.SCHOOL, lat: 12.9141, lng: 77.6389, radius: 350, weight: 1.5 },
    { name: "Delhi Public School, Koramangala", type: ZoneType.SCHOOL, lat: 12.9340, lng: 77.6190, radius: 350, weight: 1.5 },
    { name: "Vibgyor High, BTM Layout", type: ZoneType.SCHOOL, lat: 12.9150, lng: 77.6080, radius: 300, weight: 1.5 },

    // Water bodies (leachate contamination)
    { name: "Bellandur Lake", type: ZoneType.WATER_BODY, lat: 12.9366, lng: 77.6682, radius: 1200, weight: 1.4 },
    { name: "Agara Lake", type: ZoneType.WATER_BODY, lat: 12.9231, lng: 77.6387, radius: 600, weight: 1.4 },
    { name: "Madiwala Lake", type: ZoneType.WATER_BODY, lat: 12.9177, lng: 77.6190, radius: 700, weight: 1.4 },

    // Food markets
    { name: "HSR Layout BDA Market", type: ZoneType.FOOD_MARKET, lat: 12.9105, lng: 77.6412, radius: 300, weight: 1.3 },
    { name: "Madiwala Market", type: ZoneType.FOOD_MARKET, lat: 12.9220, lng: 77.6190, radius: 350, weight: 1.3 },
    { name: "Jayanagar 4th Block Market", type: ZoneType.FOOD_MARKET, lat: 12.9250, lng: 77.5838, radius: 300, weight: 1.3 },

    // Dense residential
    { name: "HSR Layout Sector 2 Residential", type: ZoneType.RESIDENTIAL_DENSE, lat: 12.9142, lng: 77.6450, radius: 800, weight: 1.2 },
    { name: "BTM Layout 2nd Stage Residential", type: ZoneType.RESIDENTIAL_DENSE, lat: 12.9140, lng: 77.6100, radius: 800, weight: 1.2 },
  ];

  for (const z of zones) {
    await prisma.sensitiveZone.create({
      data: {
        name: z.name,
        type: z.type,
        latitude: z.lat,
        longitude: z.lng,
        radiusMeters: z.radius,
        weight: z.weight,
        city: CITY,
      },
    });
  }

  // The Bengaluru institution dataset: colleges, hospitals and schools whose
  // coordinates were resolved from OpenStreetMap by scripts/geocode-zones.ts
  // and bounds-checked. Names already seeded above are skipped so the two
  // lists cannot produce duplicates.
  const seededNames = new Set(zones.map((z) => z.name));
  let institutionCount = 0;

  for (const zone of BANGALORE_ZONES) {
    if (seededNames.has(zone.name)) continue;

    await prisma.sensitiveZone.create({
      data: {
        name: zone.name,
        type: zone.type as ZoneType,
        latitude: zone.latitude,
        longitude: zone.longitude,
        radiusMeters: zone.radiusMeters,
        weight: zone.weight,
        city: zone.city,
      },
    });

    seededNames.add(zone.name);
    institutionCount += 1;
  }

  const byType = BANGALORE_ZONES.reduce<Record<string, number>>((acc, zone) => {
    acc[zone.type] = (acc[zone.type] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    `Seeded ${institutionCount} Bengaluru institutions ` +
      `(${Object.entries(byType)
        .map(([type, count]) => `${type.toLowerCase()}: ${count}`)
        .join(", ")}).`
  );

  console.log(`Seeded ${zones.length} sensitive zones.`);
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
