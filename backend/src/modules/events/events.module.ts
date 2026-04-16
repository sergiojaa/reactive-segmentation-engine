import { Module, forwardRef } from '@nestjs/common';
import { SegmentEvaluationModule } from '../segment-evaluation/segment-evaluation.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [forwardRef(() => SegmentEvaluationModule)],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
