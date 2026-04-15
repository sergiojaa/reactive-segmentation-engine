import { Module } from '@nestjs/common';
import { SegmentEvaluationController } from './segment-evaluation.controller';
import { SegmentEvaluationService } from './segment-evaluation.service';

@Module({
  controllers: [SegmentEvaluationController],
  providers: [SegmentEvaluationService],
})
export class SegmentEvaluationModule {}
