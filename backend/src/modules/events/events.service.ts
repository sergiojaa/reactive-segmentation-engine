import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { SegmentRecalculationProcessorService } from '../segment-evaluation/segment-recalculation-processor.service';

type PrismaTx = Prisma.TransactionClient | PrismaClient;

type CustomerCreatedPayload = {
  customerId: string;
  externalId: string | null;
  email: string | null;
};

type CustomerUpdatedPayload = {
  customerId: string;
  changedFields: string[];
};

type TransactionCreatedPayload = {
  transactionId: string;
  customerId: string;
  type: string;
  amount: string;
  currency: string;
  occurredAt: string;
};

type SimulationClockAdvancedPayload = {
  clockId: string;
  previousTime: Date;
  currentTime: Date;
  advancedBySeconds: number;
  reason?: string;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly segmentRecalculationProcessorService: SegmentRecalculationProcessorService,
  ) {}

  async recordCustomerCreated(
    tx: PrismaTx,
    payload: CustomerCreatedPayload,
  ): Promise<void> {
    await tx.dataChangeEvent.create({
      data: {
        entityType: 'CUSTOMER',
        entityId: payload.customerId,
        changeType: 'CREATED',
        customerId: payload.customerId,
        source: 'api.customers.create',
        occurredAt: new Date(),
        payloadJson: this.toJsonInputValue({
          ...payload,
          triggerHint: 'CUSTOMER_REEVALUATION',
        }),
      },
    });

    await this.segmentRecalculationProcessorService.notifyDataChangeRecorded();
  }

  async recordCustomerUpdated(
    tx: PrismaTx,
    payload: CustomerUpdatedPayload,
  ): Promise<void> {
    await tx.dataChangeEvent.create({
      data: {
        entityType: 'CUSTOMER',
        entityId: payload.customerId,
        changeType: 'UPDATED',
        customerId: payload.customerId,
        source: 'api.customers.update',
        occurredAt: new Date(),
        payloadJson: this.toJsonInputValue({
          ...payload,
          triggerHint: 'CUSTOMER_REEVALUATION',
        }),
      },
    });

    await this.segmentRecalculationProcessorService.notifyDataChangeRecorded();
  }

  async recordTransactionCreated(
    tx: PrismaTx,
    payload: TransactionCreatedPayload,
  ): Promise<void> {
    await tx.dataChangeEvent.create({
      data: {
        entityType: 'TRANSACTION',
        entityId: payload.transactionId,
        changeType: 'CREATED',
        customerId: payload.customerId,
        transactionId: payload.transactionId,
        source: 'api.transactions.create',
        occurredAt: new Date(),
        payloadJson: this.toJsonInputValue({
          ...payload,
          triggerHint: 'TRANSACTION_REEVALUATION',
        }),
      },
    });

    await this.segmentRecalculationProcessorService.notifyDataChangeRecorded();
  }

  async recordSimulationClockAdvanced(
    tx: PrismaTx,
    payload: SimulationClockAdvancedPayload,
  ): Promise<void> {
    await tx.dataChangeEvent.create({
      data: {
        entityType: 'SIMULATION_CLOCK',
        entityId: payload.clockId,
        changeType: 'ADVANCED',
        source: 'simulation.clock.advance',
        occurredAt: payload.currentTime,
        payloadJson: this.toJsonInputValue({
          previousTime: payload.previousTime.toISOString(),
          currentTime: payload.currentTime.toISOString(),
          advancedBySeconds: payload.advancedBySeconds,
          reason: payload.reason ?? null,
          triggerHint: 'TIME_ADVANCE_REEVALUATION',
        }),
      },
    });

    await this.segmentRecalculationProcessorService.notifyDataChangeRecorded();
  }

  private toJsonInputValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
