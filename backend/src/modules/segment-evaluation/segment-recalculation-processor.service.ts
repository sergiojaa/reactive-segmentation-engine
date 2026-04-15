import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataChangeEventStatus, SegmentType } from '@prisma/client';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SegmentEvaluationService } from './segment-evaluation.service';

type PendingEventRow = {
  id: string;
  customerId: string | null;
};

@Injectable()
export class SegmentRecalculationProcessorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    SegmentRecalculationProcessorService.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private inProcess = false;
  private fallbackNextRunAtMs = 0;

  private readonly redisNextRunAtKey = 'segment-recalc:next-run-at-ms';
  private readonly redisLockKey = 'segment-recalc:lock';
  private readonly pollIntervalMs: number;
  private readonly debounceWindowMs: number;
  private readonly eventChunkSize: number;
  private readonly segmentChunkSize: number;
  private readonly lockTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly segmentEvaluationService: SegmentEvaluationService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.pollIntervalMs = this.getPositiveInt('RECALC_POLL_INTERVAL_MS', 1500);
    this.debounceWindowMs = this.getPositiveInt(
      'RECALC_DEBOUNCE_WINDOW_MS',
      3000,
    );
    this.eventChunkSize = this.getPositiveInt('RECALC_EVENT_CHUNK_SIZE', 1000);
    this.segmentChunkSize = this.getPositiveInt(
      'RECALC_SEGMENT_CHUNK_SIZE',
      20,
    );
    this.lockTtlMs = this.getPositiveInt('RECALC_LOCK_TTL_MS', 30000);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async notifyDataChangeRecorded(): Promise<void> {
    const nextRunAtMs = Date.now() + this.debounceWindowMs;
    await this.scheduleNextRunAt(nextRunAtMs);
  }

  private async tick(): Promise<void> {
    if (this.inProcess) {
      return;
    }

    const shouldRun = await this.isDueToRun();
    if (!shouldRun) {
      return;
    }

    this.inProcess = true;
    const lockToken = `${process.pid}-${Date.now()}`;

    try {
      const lockAcquired = await this.acquireLock(lockToken);
      if (!lockAcquired) {
        return;
      }

      await this.processPendingEventChunk();
    } finally {
      await this.releaseLock(lockToken);
      this.inProcess = false;
    }
  }

  private async processPendingEventChunk(): Promise<void> {
    const pendingEvents = await this.prisma.dataChangeEvent.findMany({
      where: {
        status: DataChangeEventStatus.PENDING,
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: this.eventChunkSize,
      select: {
        id: true,
        customerId: true,
      },
    });

    if (pendingEvents.length === 0) {
      return;
    }

    const impactedCustomerCount = this.countDistinctCustomers(pendingEvents);
    const dynamicSegments = await this.prisma.segment.findMany({
      where: {
        deletedAt: null,
        type: SegmentType.DYNAMIC,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    try {
      for (let i = 0; i < dynamicSegments.length; i += this.segmentChunkSize) {
        const segmentChunk = dynamicSegments.slice(
          i,
          i + this.segmentChunkSize,
        );
        for (const segment of segmentChunk) {
          await this.segmentEvaluationService.evaluateSegment(segment.id);
        }
      }

      await this.prisma.dataChangeEvent.updateMany({
        where: {
          id: { in: pendingEvents.map((event) => event.id) },
          status: DataChangeEventStatus.PENDING,
        },
        data: {
          status: DataChangeEventStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });

      // If the chunk was full, there may be many more events waiting
      // (e.g. 50K burst). Schedule another run immediately.
      if (pendingEvents.length === this.eventChunkSize) {
        await this.scheduleNextRunAt(Date.now());
      }

      this.logger.log(
        `Processed ${pendingEvents.length} data-change events for ${dynamicSegments.length} dynamic segments (${impactedCustomerCount} distinct customers in batch)`,
      );
    } catch (error) {
      await this.prisma.dataChangeEvent.updateMany({
        where: {
          id: { in: pendingEvents.map((event) => event.id) },
          status: DataChangeEventStatus.PENDING,
        },
        data: {
          status: DataChangeEventStatus.FAILED,
          processedAt: new Date(),
          errorMessage: (error as Error).message,
          retryCount: { increment: 1 },
        },
      });

      this.logger.error(
        `Failed processing ${pendingEvents.length} data-change events: ${(error as Error).message}`,
      );
    }
  }

  private countDistinctCustomers(events: PendingEventRow[]): number {
    const distinct = new Set(
      events
        .map((event) => event.customerId)
        .filter((customerId): customerId is string => customerId !== null),
    );
    return distinct.size;
  }

  private async isDueToRun(): Promise<boolean> {
    const scheduledAtMs = await this.getScheduledRunAtMs();
    if (!scheduledAtMs) {
      return false;
    }
    return Date.now() >= scheduledAtMs;
  }

  private async scheduleNextRunAt(nextRunAtMs: number): Promise<void> {
    this.fallbackNextRunAtMs = Math.max(this.fallbackNextRunAtMs, nextRunAtMs);
    const redis = this.redisService.getClient();
    if (!redis) {
      return;
    }

    try {
      await redis.set(
        this.redisNextRunAtKey,
        String(nextRunAtMs),
        'PX',
        Math.max(this.debounceWindowMs * 20, 60000),
      );
    } catch (error) {
      this.logger.warn(
        `Could not schedule recalculation in Redis: ${(error as Error).message}`,
      );
    }
  }

  private async getScheduledRunAtMs(): Promise<number> {
    const redis = this.redisService.getClient();
    if (!redis) {
      return this.fallbackNextRunAtMs;
    }

    try {
      const raw = await redis.get(this.redisNextRunAtKey);
      if (!raw) {
        return this.fallbackNextRunAtMs;
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : this.fallbackNextRunAtMs;
    } catch {
      return this.fallbackNextRunAtMs;
    }
  }

  private async acquireLock(token: string): Promise<boolean> {
    const redis = this.redisService.getClient();
    if (!redis) {
      return true;
    }

    try {
      const result = await redis.set(
        this.redisLockKey,
        token,
        'PX',
        this.lockTtlMs,
        'NX',
      );
      return result === 'OK';
    } catch {
      return true;
    }
  }

  private async releaseLock(token: string): Promise<void> {
    const redis = this.redisService.getClient();
    if (!redis) {
      if (this.fallbackNextRunAtMs <= Date.now()) {
        this.fallbackNextRunAtMs = 0;
      }
      return;
    }

    try {
      const currentToken = await redis.get(this.redisLockKey);
      if (currentToken === token) {
        await redis.del(this.redisLockKey);
      }

      const scheduledAt = await redis.get(this.redisNextRunAtKey);
      if (scheduledAt && Number(scheduledAt) <= Date.now()) {
        await redis.del(this.redisNextRunAtKey);
      }
    } catch {
      if (this.fallbackNextRunAtMs <= Date.now()) {
        this.fallbackNextRunAtMs = 0;
      }
    }
  }

  private getPositiveInt(key: string, defaultValue: number): number {
    const raw = this.configService.get<string>(key);
    if (!raw) {
      return defaultValue;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return defaultValue;
    }

    return parsed;
  }
}
