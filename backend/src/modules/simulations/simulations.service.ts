import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UpdateCustomerDto } from '../customers/dto/update-customer.dto';
import { CustomersService } from '../customers/customers.service';
import { EventsService } from '../events/events.service';
import { CreateTransactionDto } from '../transactions/dto/create-transaction.dto';
import { TransactionsService } from '../transactions/transactions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdvanceSimulationTimeDto } from './dto/advance-simulation-time.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';
import {
  AdvancedSimulationTimeResponseDto,
  SimulatedCustomerUpdateResponseDto,
  SimulatedTransactionResponseDto,
} from './dto/simulation-response.dto';

@Injectable()
export class SimulationsService {
  private static readonly GLOBAL_CLOCK_KEY = 'global';
  private static readonly DEFAULT_PIPELINE_PATH =
    'Write API -> DataChangeEvent -> SegmentRecalculationProcessor -> Dynamic segment evaluation';
  private static readonly STATIC_SEGMENTS_NOTE =
    'Static segments are not auto-recomputed by DataChangeEvent processing.';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TransactionsService))
    private readonly transactionsService: TransactionsService,
    @Inject(forwardRef(() => CustomersService))
    private readonly customersService: CustomersService,
    @Inject(forwardRef(() => EventsService))
    private readonly eventsService: EventsService,
  ) {}

  async getEffectiveNow(): Promise<Date> {
    const clock = await this.prisma.simulationClock.findUnique({
      where: { key: SimulationsService.GLOBAL_CLOCK_KEY },
      select: { currentTime: true },
    });

    return clock?.currentTime ?? new Date();
  }

  async simulateTransaction(
    dto: SimulateTransactionDto,
  ): Promise<SimulatedTransactionResponseDto> {
    const simulationNow = await this.getEffectiveNow();
    const transactionInput: CreateTransactionDto = {
      ...dto,
      occurredAt: dto.occurredAt ?? simulationNow,
    };

    const transaction = await this.transactionsService.create(transactionInput);

    return {
      action: 'transaction-added',
      transaction,
      simulationNow,
      pipeline: this.pipelineInfo(),
    };
  }

  async simulateCustomerUpdate(
    customerId: string,
    dto: UpdateCustomerDto,
  ): Promise<SimulatedCustomerUpdateResponseDto> {
    const customer = await this.customersService.update(customerId, dto);
    const simulationNow = await this.getEffectiveNow();

    return {
      action: 'customer-updated',
      customer,
      simulationNow,
      pipeline: this.pipelineInfo(),
    };
  }

  async advanceTime(
    dto: AdvanceSimulationTimeDto,
  ): Promise<AdvancedSimulationTimeResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const baseClock = await this.ensureClockExists(tx);
      const previousTime = baseClock.currentTime;
      const currentTime = new Date(previousTime.getTime() + dto.seconds * 1000);

      const updatedClock = await tx.simulationClock.update({
        where: { key: SimulationsService.GLOBAL_CLOCK_KEY },
        data: {
          currentTime,
          isFrozen: true,
          lastAdvancedAt: new Date(),
          metadataJson: this.toJsonInputValue({
            reason: dto.reason ?? null,
            advancedBySeconds: dto.seconds,
          }),
        },
        select: {
          id: true,
          currentTime: true,
        },
      });

      await this.eventsService.recordSimulationClockAdvanced(tx, {
        clockId: updatedClock.id,
        previousTime,
        currentTime: updatedClock.currentTime,
        advancedBySeconds: dto.seconds,
        reason: dto.reason,
      });

      return { previousTime, currentTime: updatedClock.currentTime };
    });

    return {
      action: 'time-advanced',
      previousTime: result.previousTime,
      currentTime: result.currentTime,
      advancedBySeconds: dto.seconds,
      pipeline: this.pipelineInfo(),
    };
  }

  private pipelineInfo(): {
    path: string;
    staticSegmentsNote: string;
  } {
    return {
      path: SimulationsService.DEFAULT_PIPELINE_PATH,
      staticSegmentsNote: SimulationsService.STATIC_SEGMENTS_NOTE,
    };
  }

  private async ensureClockExists(
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string; currentTime: Date }> {
    const existingClock = await tx.simulationClock.findUnique({
      where: { key: SimulationsService.GLOBAL_CLOCK_KEY },
      select: { id: true, currentTime: true },
    });

    if (existingClock) {
      return existingClock;
    }

    const now = new Date();
    return tx.simulationClock.create({
      data: {
        key: SimulationsService.GLOBAL_CLOCK_KEY,
        currentTime: now,
        isFrozen: true,
      },
      select: { id: true, currentTime: true },
    });
  }

  private toJsonInputValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
