import { Module } from '@nestjs/common';
import { CustomersModule } from './modules/customers/customers.module';
import { EventsModule } from './modules/events/events.module';
import { SegmentEvaluationModule } from './modules/segment-evaluation/segment-evaluation.module';
import { SegmentsModule } from './modules/segments/segments.module';
import { SimulationsModule } from './modules/simulations/simulations.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
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
