-- CreateEnum
CREATE TYPE "public"."CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "public"."SegmentType" AS ENUM ('DYNAMIC', 'STATIC');

-- CreateEnum
CREATE TYPE "public"."SegmentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."MembershipStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "public"."DeltaChangeType" AS ENUM ('ADDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "public"."EvaluationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."EvaluationTriggerType" AS ENUM ('MANUAL', 'SCHEDULED', 'CUSTOMER_CHANGE', 'TRANSACTION_CHANGE', 'DEPENDENCY_CHANGE', 'SIMULATION');

-- CreateEnum
CREATE TYPE "public"."EvaluationScopeType" AS ENUM ('FULL', 'CUSTOMER_SET', 'SIMULATION');

-- CreateEnum
CREATE TYPE "public"."OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."customers" (
    "id" UUID NOT NULL,
    "externalId" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "status" "public"."CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "country" TEXT,
    "city" TEXT,
    "dateOfBirth" DATE,
    "attributesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_attribute_snapshots" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT,
    "attributesJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_attribute_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transactions" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "externalId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."segments" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "public"."SegmentType" NOT NULL,
    "status" "public"."SegmentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "definitionJson" JSONB,
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."segment_dependencies" (
    "id" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "dependsOnSegmentId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segment_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."segment_evaluation_runs" (
    "id" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "parentRunId" UUID,
    "triggerType" "public"."EvaluationTriggerType" NOT NULL,
    "scopeType" "public"."EvaluationScopeType" NOT NULL,
    "status" "public"."EvaluationRunStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredByCustomerId" UUID,
    "triggeredBySegmentId" UUID,
    "inputSnapshotJson" JSONB,
    "statisticsJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segment_evaluation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."segment_memberships" (
    "id" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "public"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "sourceRunId" UUID,
    "addedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segment_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."segment_membership_deltas" (
    "id" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "changeType" "public"."DeltaChangeType" NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segment_membership_deltas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."outbox_events" (
    "id" UUID NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "status" "public"."OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_externalId_key" ON "public"."customers"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "public"."customers"("email");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "public"."customers"("status");

-- CreateIndex
CREATE INDEX "customers_country_idx" ON "public"."customers"("country");

-- CreateIndex
CREATE INDEX "customers_city_idx" ON "public"."customers"("city");

-- CreateIndex
CREATE INDEX "customers_createdAt_idx" ON "public"."customers"("createdAt");

-- CreateIndex
CREATE INDEX "customer_attribute_snapshots_customerId_createdAt_idx" ON "public"."customer_attribute_snapshots"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_attribute_snapshots_customerId_version_key" ON "public"."customer_attribute_snapshots"("customerId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_externalId_key" ON "public"."transactions"("externalId");

-- CreateIndex
CREATE INDEX "transactions_customerId_occurredAt_idx" ON "public"."transactions"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "transactions_type_occurredAt_idx" ON "public"."transactions"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "transactions_occurredAt_idx" ON "public"."transactions"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "segments_key_key" ON "public"."segments"("key");

-- CreateIndex
CREATE INDEX "segments_type_status_idx" ON "public"."segments"("type", "status");

-- CreateIndex
CREATE INDEX "segments_updatedAt_idx" ON "public"."segments"("updatedAt");

-- CreateIndex
CREATE INDEX "segment_dependencies_segmentId_idx" ON "public"."segment_dependencies"("segmentId");

-- CreateIndex
CREATE INDEX "segment_dependencies_dependsOnSegmentId_idx" ON "public"."segment_dependencies"("dependsOnSegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "segment_dependencies_segmentId_dependsOnSegmentId_key" ON "public"."segment_dependencies"("segmentId", "dependsOnSegmentId");

-- CreateIndex
CREATE INDEX "segment_evaluation_runs_segmentId_createdAt_idx" ON "public"."segment_evaluation_runs"("segmentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "segment_evaluation_runs_status_createdAt_idx" ON "public"."segment_evaluation_runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "segment_evaluation_runs_triggerType_createdAt_idx" ON "public"."segment_evaluation_runs"("triggerType", "createdAt");

-- CreateIndex
CREATE INDEX "segment_evaluation_runs_parentRunId_idx" ON "public"."segment_evaluation_runs"("parentRunId");

-- CreateIndex
CREATE INDEX "segment_memberships_segmentId_status_customerId_idx" ON "public"."segment_memberships"("segmentId", "status", "customerId");

-- CreateIndex
CREATE INDEX "segment_memberships_customerId_status_idx" ON "public"."segment_memberships"("customerId", "status");

-- CreateIndex
CREATE INDEX "segment_memberships_sourceRunId_idx" ON "public"."segment_memberships"("sourceRunId");

-- CreateIndex
CREATE UNIQUE INDEX "segment_memberships_segmentId_customerId_key" ON "public"."segment_memberships"("segmentId", "customerId");

-- CreateIndex
CREATE INDEX "segment_membership_deltas_segmentId_effectiveAt_idx" ON "public"."segment_membership_deltas"("segmentId", "effectiveAt");

-- CreateIndex
CREATE INDEX "segment_membership_deltas_customerId_effectiveAt_idx" ON "public"."segment_membership_deltas"("customerId", "effectiveAt");

-- CreateIndex
CREATE INDEX "segment_membership_deltas_runId_idx" ON "public"."segment_membership_deltas"("runId");

-- CreateIndex
CREATE INDEX "segment_membership_deltas_changeType_effectiveAt_idx" ON "public"."segment_membership_deltas"("changeType", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_dedupeKey_key" ON "public"."outbox_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "outbox_events_status_availableAt_idx" ON "public"."outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateType_aggregateId_idx" ON "public"."outbox_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "outbox_events_eventType_createdAt_idx" ON "public"."outbox_events"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."customer_attribute_snapshots" ADD CONSTRAINT "customer_attribute_snapshots_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_dependencies" ADD CONSTRAINT "segment_dependencies_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_dependencies" ADD CONSTRAINT "segment_dependencies_dependsOnSegmentId_fkey" FOREIGN KEY ("dependsOnSegmentId") REFERENCES "public"."segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_evaluation_runs" ADD CONSTRAINT "segment_evaluation_runs_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_evaluation_runs" ADD CONSTRAINT "segment_evaluation_runs_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "public"."segment_evaluation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_evaluation_runs" ADD CONSTRAINT "segment_evaluation_runs_triggeredByCustomerId_fkey" FOREIGN KEY ("triggeredByCustomerId") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_evaluation_runs" ADD CONSTRAINT "segment_evaluation_runs_triggeredBySegmentId_fkey" FOREIGN KEY ("triggeredBySegmentId") REFERENCES "public"."segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_memberships" ADD CONSTRAINT "segment_memberships_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_memberships" ADD CONSTRAINT "segment_memberships_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_memberships" ADD CONSTRAINT "segment_memberships_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "public"."segment_evaluation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_membership_deltas" ADD CONSTRAINT "segment_membership_deltas_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_membership_deltas" ADD CONSTRAINT "segment_membership_deltas_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."segment_membership_deltas" ADD CONSTRAINT "segment_membership_deltas_runId_fkey" FOREIGN KEY ("runId") REFERENCES "public"."segment_evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
