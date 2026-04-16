import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeltaChangeType,
  EvaluationRunStatus,
  EvaluationScopeType,
  EvaluationTriggerType,
  MembershipStatus,
  Prisma,
  SegmentType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SegmentDeltaSignalBridgeService } from '../segment-delta-signals/segment-delta-signal-bridge.service';
import { SimulationsService } from '../simulations/simulations.service';
import { SegmentEvaluationResultDto } from './dto/segment-evaluation-result.dto';

type DirectDynamicRuleType = 'ACTIVE_BUYERS' | 'VIP_CUSTOMERS' | 'RISK_GROUP';

type DirectDynamicRuleDefinition = {
  ruleType: DirectDynamicRuleType;
  lookbackDays?: number;
  minTransactions?: number;
  minTotalAmount?: number;
  inactivityDays?: number;
};

type EvaluationContext = {
  triggerType: EvaluationTriggerType;
  parentRunId: string | null;
  triggeredBySegmentId: string | null;
};

type EvaluationExecutionResult = SegmentEvaluationResultDto & {
  runId: string;
  hasMembershipChanges: boolean;
};

@Injectable()
export class SegmentEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly simulationsService: SimulationsService,
    private readonly segmentDeltaSignalBridge: SegmentDeltaSignalBridgeService,
  ) {}

  async evaluateSegment(
    segmentId: string,
  ): Promise<SegmentEvaluationResultDto> {
    const visitedSegmentIds = new Set<string>([segmentId]);
    const evaluation = await this.evaluateSegmentOnce(segmentId, {
      triggerType: EvaluationTriggerType.MANUAL,
      parentRunId: null,
      triggeredBySegmentId: null,
    });

    if (evaluation.hasMembershipChanges) {
      await this.cascadeDependentDynamicSegments(
        segmentId,
        evaluation.runId,
        visitedSegmentIds,
      );
    }

    return evaluation;
  }

  private async evaluateSegmentOnce(
    segmentId: string,
    context: EvaluationContext,
  ): Promise<EvaluationExecutionResult> {
    const segment = await this.prisma.segment.findFirst({
      where: {
        id: segmentId,
        deletedAt: null,
      },
      select: {
        id: true,
        type: true,
        definitionJson: true,
      },
    });

    if (!segment) {
      throw new NotFoundException(
        `Segment with id "${segmentId}" was not found`,
      );
    }

    if (segment.type === SegmentType.STATIC) {
      throw new BadRequestException(
        'Static segments are not supported by direct dynamic evaluation',
      );
    }

    const rule = this.parseDirectRule(segment.definitionJson);
    const effectiveNow = await this.simulationsService.getEffectiveNow();
    const evaluatedCustomerIds = await this.evaluateDirectRule(
      rule,
      effectiveNow,
    );
    const customerIds = this.toSortedUniqueIds(evaluatedCustomerIds);
    const startedAt = new Date();

    const {
      runId,
      triggerType: runTriggerType,
      scopeType,
      status,
      finishedAt,
      addedCustomerIds,
      removedCustomerIds,
    } = await this.prisma.$transaction(async (tx) => {
      const previousActiveMemberships = await tx.segmentMembership.findMany({
        where: {
          segmentId: segment.id,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          customerId: true,
        },
      });

      const previousCustomerIds = previousActiveMemberships.map(
        (membership) => membership.customerId,
      );

      const addedCustomerIds = this.calculateAddedCustomerIds(
        previousCustomerIds,
        customerIds,
      );
      const removedCustomerIds = this.calculateRemovedCustomerIds(
        previousCustomerIds,
        customerIds,
      );
      const retainedCustomerIds = this.calculateRetainedCustomerIds(
        previousCustomerIds,
        customerIds,
      );

      const finishedAt = new Date();
      const run = await tx.segmentEvaluationRun.create({
        data: {
          segmentId: segment.id,
          parentRunId: context.parentRunId,
          triggerType: context.triggerType,
          scopeType: EvaluationScopeType.FULL,
          status: EvaluationRunStatus.COMPLETED,
          triggeredBySegmentId: context.triggeredBySegmentId,
          startedAt,
          finishedAt,
          inputSnapshotJson: {
            ruleType: rule.ruleType,
            effectiveNow: effectiveNow.toISOString(),
            triggerType: context.triggerType,
          },
          statisticsJson: {
            previousCount: previousCustomerIds.length,
            currentCount: customerIds.length,
            addedCount: addedCustomerIds.length,
            removedCount: removedCustomerIds.length,
          },
        },
      });

      if (addedCustomerIds.length > 0) {
        await tx.segmentMembership.createMany({
          data: addedCustomerIds.map((customerId) => ({
            segmentId: segment.id,
            customerId,
            status: MembershipStatus.ACTIVE,
            sourceRunId: run.id,
            isManual: false,
            addedAt: effectiveNow,
            removedAt: null,
            lastEvaluatedAt: effectiveNow,
          })),
          skipDuplicates: true,
        });

        await tx.segmentMembership.updateMany({
          where: {
            segmentId: segment.id,
            customerId: { in: addedCustomerIds },
          },
          data: {
            status: MembershipStatus.ACTIVE,
            sourceRunId: run.id,
            addedAt: effectiveNow,
            removedAt: null,
            lastEvaluatedAt: effectiveNow,
          },
        });
      }

      if (retainedCustomerIds.length > 0) {
        await tx.segmentMembership.updateMany({
          where: {
            segmentId: segment.id,
            customerId: { in: retainedCustomerIds },
          },
          data: {
            status: MembershipStatus.ACTIVE,
            sourceRunId: run.id,
            removedAt: null,
            lastEvaluatedAt: effectiveNow,
          },
        });
      }

      if (removedCustomerIds.length > 0) {
        await tx.segmentMembership.updateMany({
          where: {
            segmentId: segment.id,
            customerId: { in: removedCustomerIds },
          },
          data: {
            status: MembershipStatus.REMOVED,
            sourceRunId: run.id,
            removedAt: effectiveNow,
            lastEvaluatedAt: effectiveNow,
          },
        });
      }

      const membershipDeltaRows = [
        ...addedCustomerIds.map((customerId) => ({
          segmentId: segment.id,
          customerId,
          runId: run.id,
          changeType: DeltaChangeType.ADDED,
          effectiveAt: effectiveNow,
        })),
        ...removedCustomerIds.map((customerId) => ({
          segmentId: segment.id,
          customerId,
          runId: run.id,
          changeType: DeltaChangeType.REMOVED,
          effectiveAt: effectiveNow,
        })),
      ];

      if (membershipDeltaRows.length > 0) {
        await tx.segmentMembershipDelta.createMany({
          data: membershipDeltaRows,
        });
      }

      return {
        runId: run.id,
        triggerType: run.triggerType,
        scopeType: run.scopeType,
        status: run.status,
        finishedAt,
        addedCustomerIds,
        removedCustomerIds,
      };
    });

    if (addedCustomerIds.length > 0 || removedCustomerIds.length > 0) {
      this.segmentDeltaSignalBridge.publish({
        segmentId: segment.id,
        evaluationRunId: runId,
        addedCustomerIds,
        removedCustomerIds,
        addedCount: addedCustomerIds.length,
        removedCount: removedCustomerIds.length,
        timestamp: finishedAt.toISOString(),
      });
    }

    return {
      segmentId: segment.id,
      ruleType: rule.ruleType,
      effectiveNow,
      evaluatedAt: effectiveNow,
      customerIds,
      addedCustomerIds,
      removedCustomerIds,
      metadata: {
        runId,
        triggerType: runTriggerType,
        scopeType,
        status,
        startedAt,
        finishedAt,
      },
      runId,
      hasMembershipChanges:
        addedCustomerIds.length > 0 || removedCustomerIds.length > 0,
    };
  }

  private async cascadeDependentDynamicSegments(
    changedSegmentId: string,
    parentRunId: string,
    visitedSegmentIds: Set<string>,
  ): Promise<void> {
    const dependentSegments = await this.prisma.segmentDependency.findMany({
      where: {
        dependsOnSegmentId: changedSegmentId,
        segment: {
          deletedAt: null,
          type: SegmentType.DYNAMIC,
        },
      },
      select: {
        segmentId: true,
      },
    });

    for (const dependent of dependentSegments) {
      if (visitedSegmentIds.has(dependent.segmentId)) {
        continue;
      }

      visitedSegmentIds.add(dependent.segmentId);

      const evaluation = await this.evaluateSegmentOnce(dependent.segmentId, {
        triggerType: EvaluationTriggerType.DEPENDENCY_CHANGE,
        parentRunId,
        triggeredBySegmentId: changedSegmentId,
      });

      if (evaluation.hasMembershipChanges) {
        await this.cascadeDependentDynamicSegments(
          dependent.segmentId,
          evaluation.runId,
          visitedSegmentIds,
        );
      }
    }
  }

  private toSortedUniqueIds(customerIds: string[]): string[] {
    return [...new Set(customerIds)].sort((a, b) => a.localeCompare(b));
  }

  private calculateAddedCustomerIds(
    previousCustomerIds: string[],
    currentCustomerIds: string[],
  ): string[] {
    const previousSet = new Set(previousCustomerIds);
    return currentCustomerIds.filter(
      (customerId) => !previousSet.has(customerId),
    );
  }

  private calculateRemovedCustomerIds(
    previousCustomerIds: string[],
    currentCustomerIds: string[],
  ): string[] {
    const currentSet = new Set(currentCustomerIds);
    return previousCustomerIds.filter(
      (customerId) => !currentSet.has(customerId),
    );
  }

  private calculateRetainedCustomerIds(
    previousCustomerIds: string[],
    currentCustomerIds: string[],
  ): string[] {
    const previousSet = new Set(previousCustomerIds);
    return currentCustomerIds.filter((customerId) =>
      previousSet.has(customerId),
    );
  }

  private parseDirectRule(
    definitionJson: Prisma.JsonValue | null,
  ): DirectDynamicRuleDefinition {
    if (
      !definitionJson ||
      typeof definitionJson !== 'object' ||
      Array.isArray(definitionJson)
    ) {
      throw new BadRequestException(
        'Segment definitionJson must be an object containing ruleType',
      );
    }

    const candidate = definitionJson as Record<string, unknown>;
    const ruleType = candidate.ruleType;

    if (
      ruleType !== 'ACTIVE_BUYERS' &&
      ruleType !== 'VIP_CUSTOMERS' &&
      ruleType !== 'RISK_GROUP'
    ) {
      throw new BadRequestException(
        `Unsupported direct dynamic ruleType: "${String(ruleType)}"`,
      );
    }

    return {
      ruleType,
      lookbackDays: this.toOptionalPositiveInt(candidate.lookbackDays),
      minTransactions: this.toOptionalPositiveInt(candidate.minTransactions),
      minTotalAmount: this.toOptionalPositiveNumber(candidate.minTotalAmount),
      inactivityDays: this.toOptionalPositiveInt(candidate.inactivityDays),
    };
  }

  private async evaluateDirectRule(
    rule: DirectDynamicRuleDefinition,
    effectiveNow: Date,
  ): Promise<string[]> {
    switch (rule.ruleType) {
      case 'ACTIVE_BUYERS':
        return this.evaluateActiveBuyers(rule, effectiveNow);
      case 'VIP_CUSTOMERS':
        return this.evaluateVipCustomers(rule, effectiveNow);
      case 'RISK_GROUP':
        return this.evaluateRiskGroup(rule, effectiveNow);
      default:
        return [];
    }
  }

  private async evaluateActiveBuyers(
    rule: DirectDynamicRuleDefinition,
    effectiveNow: Date,
  ): Promise<string[]> {
    const lookbackDays = rule.lookbackDays ?? 30;
    const minTransactions = rule.minTransactions ?? 1;
    const threshold = this.subtractDays(effectiveNow, lookbackDays);

    const grouped = await this.prisma.transaction.groupBy({
      by: ['customerId'],
      where: {
        occurredAt: { gte: threshold },
      },
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            gte: minTransactions,
          },
        },
      },
    });

    return this.filterExistingCustomerIds(
      grouped.map((entry) => entry.customerId),
    );
  }

  private async evaluateVipCustomers(
    rule: DirectDynamicRuleDefinition,
    effectiveNow: Date,
  ): Promise<string[]> {
    const lookbackDays = rule.lookbackDays ?? 60;
    const minTotalAmount = rule.minTotalAmount ?? 5000;
    const threshold = this.subtractDays(effectiveNow, lookbackDays);

    const grouped = await this.prisma.transaction.groupBy({
      by: ['customerId'],
      where: {
        occurredAt: { gte: threshold },
      },
      _sum: {
        amount: true,
      },
      having: {
        amount: {
          _sum: {
            gt: new Prisma.Decimal(minTotalAmount),
          },
        },
      },
    });

    return this.filterExistingCustomerIds(
      grouped.map((entry) => entry.customerId),
    );
  }

  private async evaluateRiskGroup(
    rule: DirectDynamicRuleDefinition,
    effectiveNow: Date,
  ): Promise<string[]> {
    const inactivityDays = rule.inactivityDays ?? 90;
    const inactivityThreshold = this.subtractDays(effectiveNow, inactivityDays);

    const [recentlyActive, hadPastActivity] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          occurredAt: { gte: inactivityThreshold },
        },
        distinct: ['customerId'],
        select: { customerId: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          occurredAt: { lt: inactivityThreshold },
        },
        distinct: ['customerId'],
        select: { customerId: true },
      }),
    ]);

    const recentlyActiveSet = new Set(
      recentlyActive.map((entry) => entry.customerId),
    );
    const riskCustomerIds = hadPastActivity
      .map((entry) => entry.customerId)
      .filter((customerId) => !recentlyActiveSet.has(customerId));

    return this.filterExistingCustomerIds(riskCustomerIds);
  }

  private async filterExistingCustomerIds(
    customerIds: string[],
  ): Promise<string[]> {
    if (customerIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.customer.findMany({
      where: {
        id: { in: customerIds },
        deletedAt: null,
      },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  private subtractDays(base: Date, days: number): Date {
    const result = new Date(base);
    result.setUTCDate(result.getUTCDate() - days);
    return result;
  }

  private toOptionalPositiveInt(value: unknown): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(
        'Rule numeric values must be positive integers',
      );
    }
    return value;
  }

  private toOptionalPositiveNumber(value: unknown): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
      throw new BadRequestException(
        'Rule numeric values must be positive numbers',
      );
    }
    return value;
  }
}
