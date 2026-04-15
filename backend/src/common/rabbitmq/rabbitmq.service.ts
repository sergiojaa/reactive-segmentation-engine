import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { ChannelModel } from 'amqplib';

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: ChannelModel | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const rabbitMqUrl = this.configService.get<string>('RABBITMQ_URL');
    if (!rabbitMqUrl) {
      throw new Error('RABBITMQ_URL is not configured');
    }

    try {
      this.connection = await amqp.connect(rabbitMqUrl);
      this.logger.log('RabbitMQ connection initialized');
    } catch (error) {
      this.logger.warn(
        `RabbitMQ is not reachable on startup: ${(error as Error).message}`,
      );
      this.connection = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }

  getConnection(): ChannelModel | null {
    return this.connection;
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}
