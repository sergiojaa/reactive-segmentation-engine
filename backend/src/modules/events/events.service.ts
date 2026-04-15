import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

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

@Injectable()
export class EventsService {
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
  }

  private toJsonInputValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
