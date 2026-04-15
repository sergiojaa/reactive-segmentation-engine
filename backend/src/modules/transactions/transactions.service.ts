import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Transaction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async create(dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    const createdTransaction = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: dto.customerId, deletedAt: null },
        select: { id: true },
      });

      if (!customer) {
        throw new NotFoundException(
          `Customer with id "${dto.customerId}" was not found`,
        );
      }

      const transaction = await tx.transaction.create({
        data: {
          customerId: dto.customerId,
          externalId: dto.externalId,
          type: dto.type,
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency,
          occurredAt: dto.occurredAt,
          payloadJson: dto.payload
            ? this.toJsonInputValue(dto.payload)
            : undefined,
        },
      });

      await this.eventsService.recordTransactionCreated(tx, {
        transactionId: transaction.id,
        customerId: transaction.customerId,
        type: transaction.type,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        occurredAt: transaction.occurredAt.toISOString(),
      });

      return transaction;
    });

    return this.toTransactionResponse(createdTransaction);
  }

  private toTransactionResponse(
    transaction: Transaction,
  ): TransactionResponseDto {
    return {
      id: transaction.id,
      customerId: transaction.customerId,
      externalId: transaction.externalId,
      type: transaction.type,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      occurredAt: transaction.occurredAt,
      payload:
        (transaction.payloadJson as Record<string, unknown> | null) ?? null,
      createdAt: transaction.createdAt,
    };
  }

  private toJsonInputValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
