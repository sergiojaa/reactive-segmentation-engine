-- CreateEnum
CREATE TYPE "public"."DataChangeEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."data_change_events" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "changeType" TEXT NOT NULL,
    "status" "public"."DataChangeEventStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT,
    "customerId" UUID,
    "transactionId" UUID,
    "triggeredRunId" UUID,
    "payloadJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_change_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."simulation_clocks" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'global',
    "currentTime" TIMESTAMP(3) NOT NULL,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "tickSeconds" INTEGER NOT NULL DEFAULT 60,
    "lastAdvancedAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulation_clocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_change_events_status_occurredAt_idx" ON "public"."data_change_events"("status", "occurredAt");

-- CreateIndex
CREATE INDEX "data_change_events_entityType_entityId_idx" ON "public"."data_change_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "data_change_events_customerId_idx" ON "public"."data_change_events"("customerId");

-- CreateIndex
CREATE INDEX "data_change_events_transactionId_idx" ON "public"."data_change_events"("transactionId");

-- CreateIndex
CREATE INDEX "data_change_events_triggeredRunId_idx" ON "public"."data_change_events"("triggeredRunId");

-- CreateIndex
CREATE UNIQUE INDEX "simulation_clocks_key_key" ON "public"."simulation_clocks"("key");

-- AddForeignKey
ALTER TABLE "public"."data_change_events" ADD CONSTRAINT "data_change_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_change_events" ADD CONSTRAINT "data_change_events_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_change_events" ADD CONSTRAINT "data_change_events_triggeredRunId_fkey" FOREIGN KEY ("triggeredRunId") REFERENCES "public"."segment_evaluation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
