import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

/*
 * Next.js reads .env.local; the Prisma CLI does not — it only reads .env.
 * Without this, `prisma migrate` and `prisma db seed` fail with
 * "Environment variable not found: DATABASE_URL" even though the running app
 * connects fine, which makes it look like a schema problem rather than a
 * config one.
 *
 * .env.local is loaded first because dotenv does not overwrite a variable that
 * is already set, which reproduces Next.js's own precedence order.
 */
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
