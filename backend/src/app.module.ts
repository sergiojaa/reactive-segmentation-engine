import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './common/config/env.validation';
import { HealthModule } from './common/health/health.module';
import { HttpLoggingMiddleware } from './common/logging/http-logging.middleware';
import { RabbitMqModule } from './common/rabbitmq/rabbitmq.module';
import { RedisModule } from './common/redis/redis.module';
import { CustomersModule } from './modules/customers/customers.module';
import { EventsModule } from './modules/events/events.module';
import { SegmentDeltaSignalsModule } from './modules/segment-delta-signals/segment-delta-signals.module';
import { SegmentEvaluationModule } from './modules/segment-evaluation/segment-evaluation.module';
import { SegmentsModule } from './modules/segments/segments.module';
import { SimulationsModule } from './modules/simulations/simulations.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema,
      validationOptions: {
        abortEarly: true,
        allowUnknown: true,
      },
    }),
    PrismaModule,
    RedisModule,
    RabbitMqModule,
    HealthModule,
    CustomersModule,
    TransactionsModule,
    SegmentsModule,
    SegmentEvaluationModule,
    SegmentDeltaSignalsModule,
    EventsModule,
    SimulationsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpLoggingMiddleware).forRoutes('*');
  }
}
