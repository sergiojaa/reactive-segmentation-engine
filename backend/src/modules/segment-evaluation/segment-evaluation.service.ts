import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SegmentType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class SegmentEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly simulationsService: SimulationsService,
  ) {}

  async evaluateSegment(
    segmentId: string,
  ): Promise<SegmentEvaluationResultDto> {
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

    const customerIds = await this.evaluateDirectRule(rule, effectiveNow);

    return {
      segmentId: segment.id,
      ruleType: rule.ruleType,
      effectiveNow,
      evaluatedAt: effectiveNow,
      customerIds,
    };
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
