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
import { SegmentDeltaHistoryDto } from './dto/segment-delta-history.dto';
import { SegmentEvaluationResultDto } from './dto/segment-evaluation-result.dto';
import { SegmentEvaluationRunHistoryDto } from './dto/segment-evaluation-run-history.dto';
import { SegmentMembershipSnapshotDto } from './dto/segment-membership-snapshot.dto';

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
  customerIds: string[];
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

  async refreshStaticSegment(
    segmentId: string,
  ): Promise<SegmentEvaluationResultDto> {
    const visitedSegmentIds = new Set<string>([segmentId]);
    const evaluation = await this.evaluateStaticSegmentOnce(segmentId, {
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

  async getCurrentMembership(
    segmentId: string,
  ): Promise<SegmentMembershipSnapshotDto> {
    const segment = await this.prisma.segment.findFirst({
      where: { id: segmentId, deletedAt: null },
      select: { id: true, type: true },
    });

    if (!segment) {
      throw new NotFoundException(
        `Segment with id "${segmentId}" was not found`,
      );
    }

    const rows = await this.prisma.segmentMembership.findMany({
      where: {
        segmentId: segment.id,
        status: MembershipStatus.ACTIVE,
      },
      orderBy: [{ addedAt: 'desc' }, { customerId: 'asc' }],
      select: {
        customerId: true,
        addedAt: true,
        lastEvaluatedAt: true,
        isManual: true,
        customer: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      segmentId: segment.id,
      segmentType: segment.type,
      activeCount: rows.length,
      customerIds: rows.map((row) => row.customerId),
      members: rows.map((row) => ({
        customerId: row.customerId,
        email: row.customer.email,
        firstName: row.customer.firstName,
        lastName: row.customer.lastName,
        addedAt: row.addedAt,
        lastEvaluatedAt: row.lastEvaluatedAt,
        isManual: row.isManual,
      })),
    };
  }

  async getSegmentDeltaHistory(
    segmentId: string,
    limit: number,
  ): Promise<SegmentDeltaHistoryDto> {
    await this.ensureSegmentExists(segmentId);

    const [total, rows] = await Promise.all([
      this.prisma.segmentMembershipDelta.count({
        where: { segmentId },
      }),
      this.prisma.segmentMembershipDelta.findMany({
        where: { segmentId },
        take: limit,
        orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          runId: true,
          customerId: true,
          changeType: true,
          effectiveAt: true,
          createdAt: true,
          customer: {
            select: { email: true },
          },
        },
      }),
    ]);

    return {
      segmentId,
      total,
      items: rows.map((row) => ({
        id: row.id,
        runId: row.runId,
        customerId: row.customerId,
        customerEmail: row.customer.email,
        changeType: row.changeType,
        effectiveAt: row.effectiveAt,
        createdAt: row.createdAt,
      })),
    };
  }

  async getSegmentEvaluationRuns(
    segmentId: string,
    limit: number,
  ): Promise<SegmentEvaluationRunHistoryDto> {
    await this.ensureSegmentExists(segmentId);

    const [total, rows] = await Promise.all([
      this.prisma.segmentEvaluationRun.count({
        where: { segmentId },
      }),
      this.prisma.segmentEvaluationRun.findMany({
        where: { segmentId },
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          parentRunId: true,
          triggerType: true,
          scopeType: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          statisticsJson: true,
        },
      }),
    ]);

    return {
      segmentId,
      total,
      items: rows,
    };
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
    const startedAt = new Date();

    const {
      runId,
      triggerType: runTriggerType,
      scopeType,
      status,
      finishedAt,
      addedCustomerIds,
      removedCustomerIds,
      customerIds,
    } = await this.prisma.$transaction(async (tx) => {
      const allCustomerIds = this.toSortedUniqueIds(evaluatedCustomerIds);
      const customerIds = await this.filterByDependencies(
        tx,
        segment.id,
        allCustomerIds,
      );

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
        customerIds,
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

  private async evaluateStaticSegmentOnce(
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

    if (segment.type !== SegmentType.STATIC) {
      throw new BadRequestException(
        'Manual refresh endpoint supports only static segments',
      );
    }

    const explicitCustomerIds = this.parseStaticManualCustomerIds(
      segment.definitionJson,
    );
    const effectiveNow = await this.simulationsService.getEffectiveNow();
    const baseCustomerIds = this.toSortedUniqueIds(
      await this.filterExistingCustomerIds(explicitCustomerIds),
    );
    const startedAt = new Date();

    const {
      runId,
      triggerType: runTriggerType,
      scopeType,
      status,
      finishedAt,
      addedCustomerIds,
      removedCustomerIds,
      customerIds,
    } = await this.prisma.$transaction(async (tx) => {
      const customerIds = await this.filterByDependencies(
        tx,
        segment.id,
        baseCustomerIds,
      );

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
            ruleType: 'STATIC_MANUAL',
            effectiveNow: effectiveNow.toISOString(),
            triggerType: context.triggerType,
            source: 'definitionJson.customerIds',
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
            isManual: true,
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
            isManual: true,
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
            isManual: true,
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
            isManual: true,
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
        customerIds,
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
      ruleType: 'STATIC_MANUAL',
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
  private async filterByDependencies(
    tx: Prisma.TransactionClient,
    segmentId: string,
    customerIds: string[],
  ): Promise<string[]> {
    if (customerIds.length === 0) {
      return [];
    }

    const dependencies = await tx.segmentDependency.findMany({
      where: {
        segmentId,
      },
      select: {
        dependsOnSegmentId: true,
      },
    });

    if (dependencies.length === 0) {
      return customerIds;
    }

    let filtered = new Set(customerIds);

    for (const dependency of dependencies) {
      if (filtered.size === 0) {
        break;
      }

      const rows = await tx.segmentMembership.findMany({
        where: {
          segmentId: dependency.dependsOnSegmentId,
          status: MembershipStatus.ACTIVE,
          customerId: { in: Array.from(filtered) },
        },
        select: {
          customerId: true,
        },
      });

      const allowed = new Set(rows.map((row) => row.customerId));
      filtered = new Set(Array.from(filtered).filter((id) => allowed.has(id)));
    }

    return Array.from(filtered).sort((a, b) => a.localeCompare(b));
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

  private parseStaticManualCustomerIds(
    definitionJson: Prisma.JsonValue | null,
  ): string[] {
    if (
      !definitionJson ||
      typeof definitionJson !== 'object' ||
      Array.isArray(definitionJson)
    ) {
      throw new BadRequestException(
        'Static segment definitionJson must be an object with customerIds',
      );
    }

    const candidate = definitionJson as Record<string, unknown>;
    const customerIds = candidate.customerIds;
    if (!Array.isArray(customerIds)) {
      throw new BadRequestException(
        'Static segment manual refresh requires definitionJson.customerIds as string[]',
      );
    }

    if (!customerIds.every((entry) => typeof entry === 'string')) {
      throw new BadRequestException(
        'Static segment definitionJson.customerIds must contain only strings',
      );
    }

    return customerIds;
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

  private async ensureSegmentExists(segmentId: string): Promise<void> {
    const segment = await this.prisma.segment.findFirst({
      where: { id: segmentId, deletedAt: null },
      select: { id: true },
    });
    if (!segment) {
      throw new NotFoundException(
        `Segment with id "${segmentId}" was not found`,
      );
    }
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
