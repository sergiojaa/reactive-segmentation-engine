import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const options: RedisOptions = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      db: this.configService.get<number>('REDIS_DB', 0),
    };

    const password = this.configService.get<string>('REDIS_PASSWORD');
    if (password) {
      options.password = password;
    }

    options.maxRetriesPerRequest = 1;
    options.retryStrategy = (attempt) => Math.min(attempt * 200, 2000);

    this.client = new Redis(options);

    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis unavailable: ${error.message}`);
    });

    try {
      await this.client.ping();
      this.logger.log('Redis connection initialized');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Redis is not reachable on startup';
      this.logger.warn(`Redis is not reachable on startup: ${message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
