-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('SUBMITTED', 'ANALYZING', 'VERIFIED', 'ROUTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PriorityLabel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('SANITATION', 'HEALTH', 'POLLUTION_CONTROL', 'WATER', 'GENERAL');

-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('HOSPITAL', 'SCHOOL', 'WATER_BODY', 'FOOD_MARKET', 'RESIDENTIAL_DENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('DRY_RUN', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "AnonymousUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ANONYMOUS',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonymousUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CivicReport" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'GARBAGE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "anonymousId" TEXT,
    "clerkUserId" TEXT,
    "imageUrl" TEXT,
    "annotatedImageUrl" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "address" TEXT,
    "wardName" TEXT,
    "city" TEXT,
    "wasteType" TEXT,
    "detections" JSONB,
    "categoryDistribution" JSONB,
    "totalObjects" INTEGER,
    "totalCategories" INTEGER,
    "maxConfidence" DOUBLE PRECISION,
    "priorityScore" DOUBLE PRECISION,
    "priorityLabel" "PriorityLabel",
    "scoreBreakdown" JSONB,
    "zoneMultiplier" DOUBLE PRECISION,
    "nearbyPois" JSONB,
    "recurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "authorityId" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "routedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CivicReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Authority" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "department" "Department" NOT NULL DEFAULT 'SANITATION',
    "wardName" TEXT,
    "wardCode" TEXT,
    "zone" TEXT,
    "city" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "escalationTier" INTEGER NOT NULL DEFAULT 1,
    "parentAuthorityId" TEXT,
    "centroidLat" DOUBLE PRECISION,
    "centroidLng" DOUBLE PRECISION,
    "radiusMeters" INTEGER NOT NULL DEFAULT 3000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Authority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensitiveZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ZoneType" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 300,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensitiveZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "intendedTo" TEXT NOT NULL,
    "actualTo" TEXT NOT NULL,
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportStatusEvent" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "fromStatus" "ReportStatus",
    "toStatus" "ReportStatus" NOT NULL,
    "note" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousUser_username_key" ON "AnonymousUser"("username");

-- CreateIndex
CREATE INDEX "AnonymousUser_username_idx" ON "AnonymousUser"("username");

-- CreateIndex
CREATE INDEX "CivicReport_status_idx" ON "CivicReport"("status");

-- CreateIndex
CREATE INDEX "CivicReport_priorityLabel_idx" ON "CivicReport"("priorityLabel");

-- CreateIndex
CREATE INDEX "CivicReport_createdAt_idx" ON "CivicReport"("createdAt");

-- CreateIndex
CREATE INDEX "CivicReport_latitude_longitude_idx" ON "CivicReport"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Authority_wardName_idx" ON "Authority"("wardName");

-- CreateIndex
CREATE INDEX "Authority_department_idx" ON "Authority"("department");

-- CreateIndex
CREATE INDEX "Authority_city_idx" ON "Authority"("city");

-- CreateIndex
CREATE INDEX "SensitiveZone_type_idx" ON "SensitiveZone"("type");

-- CreateIndex
CREATE INDEX "SensitiveZone_latitude_longitude_idx" ON "SensitiveZone"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "EmailLog_reportId_idx" ON "EmailLog"("reportId");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "ReportStatusEvent_reportId_idx" ON "ReportStatusEvent"("reportId");

-- AddForeignKey
ALTER TABLE "CivicReport" ADD CONSTRAINT "CivicReport_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "Authority"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authority" ADD CONSTRAINT "Authority_parentAuthorityId_fkey" FOREIGN KEY ("parentAuthorityId") REFERENCES "Authority"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CivicReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportStatusEvent" ADD CONSTRAINT "ReportStatusEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CivicReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
