import { Module } from '@nestjs/common';
import { SegmentDeltaBackgroundConsumer } from './segment-delta-background-consumer.service';
import { SegmentDeltaSignalBridgeService } from './segment-delta-signal-bridge.service';
import { SegmentDeltaSignalsController } from './segment-delta-signals.controller';

@Module({
  controllers: [SegmentDeltaSignalsController],
  providers: [SegmentDeltaSignalBridgeService, SegmentDeltaBackgroundConsumer],
  exports: [SegmentDeltaSignalBridgeService],
})
export class SegmentDeltaSignalsModule {}
