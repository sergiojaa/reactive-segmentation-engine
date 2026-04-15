import { Module } from '@nestjs/common';
import { SimulationsModule } from '../simulations/simulations.module';
import { SegmentEvaluationController } from './segment-evaluation.controller';
import { SegmentEvaluationService } from './segment-evaluation.service';

@Module({
  imports: [SimulationsModule],
  controllers: [SegmentEvaluationController],
  providers: [SegmentEvaluationService],
  exports: [SegmentEvaluationService],
})
export class SegmentEvaluationModule {}
