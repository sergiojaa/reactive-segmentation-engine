import { Module } from '@nestjs/common';
import { SegmentDeltaSignalsModule } from '../segment-delta-signals/segment-delta-signals.module';
import { SimulationsModule } from '../simulations/simulations.module';
import { SegmentEvaluationController } from './segment-evaluation.controller';
import { SegmentRecalculationProcessorService } from './segment-recalculation-processor.service';
import { SegmentEvaluationService } from './segment-evaluation.service';

@Module({
  imports: [SimulationsModule, SegmentDeltaSignalsModule],
  controllers: [SegmentEvaluationController],
  providers: [SegmentEvaluationService, SegmentRecalculationProcessorService],
  exports: [SegmentEvaluationService, SegmentRecalculationProcessorService],
})
export class SegmentEvaluationModule {}
