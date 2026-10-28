/**
 * Adds the Bengaluru institution dataset to SensitiveZone.
 *
 *   npx tsx scripts/seed-zones.ts          add missing zones
 *   npx tsx scripts/seed-zones.ts --prune  also remove institution zones
 *                                          no longer in the dataset
 *
 * Unlike prisma/seed.ts this touches nothing else: no authorities, no
 * reports, no status events. Existing zones are matched by name and updated
 * in place, so re-running is safe and will not duplicate anything.
 */

import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient, ZoneType } from "@prisma/client";
import ZONES from "../prisma/data/bangalore-zones.json";

const prisma = new PrismaClient();

async function main() {
  const prune = process.argv.includes("--prune");

  const existing = await prisma.sensitiveZone.findMany({
    select: { id: true, name: true, type: true },
  });
  const byName = new Map(existing.map((zone) => [zone.name, zone]));

  let created = 0;
  let updated = 0;

  for (const zone of ZONES) {
    const data = {
      name: zone.name,
      type: zone.type as ZoneType,
      latitude: zone.latitude,
      longitude: zone.longitude,
      radiusMeters: zone.radiusMeters,
      weight: zone.weight,
      city: zone.city,
    };

    const match = byName.get(zone.name);

    if (match) {
      await prisma.sensitiveZone.update({ where: { id: match.id }, data });
      updated += 1;
    } else {
      await prisma.sensitiveZone.create({ data });
      created += 1;
    }
  }

  let pruned = 0;
  if (prune) {
    const datasetNames = new Set(ZONES.map((zone) => zone.name));
    const stale = existing.filter(
      (zone) =>
        (zone.type === "COLLEGE" ||
          zone.type === "HOSPITAL" ||
          zone.type === "SCHOOL") &&
        !datasetNames.has(zone.name)
    );

    for (const zone of stale) {
      await prisma.sensitiveZone.delete({ where: { id: zone.id } });
      console.log(`  pruned ${zone.name}`);
      pruned += 1;
    }
  }

  const totals = await prisma.sensitiveZone.groupBy({
    by: ["type"],
    _count: { _all: true },
  });

  console.log(`\ncreated ${created}, updated ${updated}, pruned ${pruned}`);
  console.log("SensitiveZone totals:");
  for (const row of totals.sort((a, b) => a.type.localeCompare(b.type))) {
    console.log(`  ${row.type}: ${row._count._all}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
