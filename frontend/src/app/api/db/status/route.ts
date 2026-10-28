import { NextResponse } from "next/server";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      message:
        "Neon DB connection string not set or contains default placeholder in DATABASE_URL.",
    });
  }

  try {
    // Attempt a lightweight query to test Neon PostgreSQL connectivity
    await prisma.$queryRaw`SELECT 1 as connected`;
    const userCount = await prisma.anonymousUser.count();
    return NextResponse.json({
      configured: true,
      connected: true,
      provider: "Neon PostgreSQL",
      anonymousUsersCount: userCount,
      message: "Successfully connected to Neon PostgreSQL database via Prisma.",
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        provider: "Neon PostgreSQL",
        error: errorMessage,
        message:
          "Database URL is provided, but connection or table schema is not ready. Run 'npx prisma db push' to apply tables to Neon.",
      },
      { status: 500 }
    );
  }
}
