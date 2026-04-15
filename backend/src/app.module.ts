import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './common/config/env.validation';
import { CustomersModule } from './modules/customers/customers.module';
import { EventsModule } from './modules/events/events.module';
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
    CustomersModule,
    TransactionsModule,
    SegmentsModule,
    SegmentEvaluationModule,
    EventsModule,
    SimulationsModule,
  ],
})
export class AppModule {}
