import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SegmentDeltaSignalBridgeService } from './segment-delta-signal-bridge.service';

/**
 * Simulates async side effects (campaigns, webhooks) driven by membership deltas.
 */
@Injectable()
export class SegmentDeltaBackgroundConsumer implements OnModuleInit {
  private readonly logger = new Logger(SegmentDeltaBackgroundConsumer.name);

  constructor(
    private readonly segmentDeltaSignalBridge: SegmentDeltaSignalBridgeService,
  ) {}

  onModuleInit(): void {
    this.segmentDeltaSignalBridge.observe().subscribe((signal) => {
      for (const customerId of signal.addedCustomerIds) {
        this.logger.log(`send message to new member ${customerId}`);
      }
      for (const customerId of signal.removedCustomerIds) {
        this.logger.log(`stop campaign for removed member ${customerId}`);
      }
    });
  }
}
