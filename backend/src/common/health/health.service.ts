import { Injectable } from '@nestjs/common';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  async getReadiness(): Promise<{
    status: 'ok' | 'degraded';
    checks: {
      database: boolean;
      redis: boolean;
      rabbitmq: boolean;
    };
  }> {
    const [database, redis] = await Promise.all([
      this.isDatabaseHealthy(),
      this.redisService.ping(),
    ]);
    const rabbitmq = this.rabbitMqService.isConnected();

    const status = database && redis && rabbitmq ? 'ok' : 'degraded';

    return {
      status,
      checks: {
        database,
        redis,
        rabbitmq,
      },
    };
  }

  private async isDatabaseHealthy(): Promise<boolean> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
