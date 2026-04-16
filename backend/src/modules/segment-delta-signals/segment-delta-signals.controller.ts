import { Controller, Get, MessageEvent, Query, Sse } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { map, Observable } from 'rxjs';
import { SegmentDeltaSignalDto } from './dto/segment-delta-signal.dto';
import { SegmentDeltaSignalBridgeService } from './segment-delta-signal-bridge.service';

@ApiTags('events')
@Controller('events/segment-deltas')
export class SegmentDeltaSignalsController {
  constructor(
    private readonly segmentDeltaSignalBridge: SegmentDeltaSignalBridgeService,
  ) {}

  @Sse('stream')
  @ApiOperation({
    summary:
      'Subscribe to segment membership delta signals (Server-Sent Events)',
    description:
      'Emits one JSON event per delta after evaluation persists membership changes. Open in a browser or an SSE client.',
  })
  stream(): Observable<MessageEvent> {
    return this.segmentDeltaSignalBridge
      .observe()
      .pipe(
        map((signal) => ({ data: JSON.stringify(signal) }) as MessageEvent),
      );
  }

  @Get('recent')
  @ApiOperation({
    summary: 'Recent segment delta signals (demo / Swagger)',
    description:
      'Returns the last signals kept in memory for quick inspection without an SSE client.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max signals to return (1–50)',
    example: 10,
  })
  @ApiOkResponse({ type: [SegmentDeltaSignalDto] })
  recent(@Query('limit') limit?: string): SegmentDeltaSignalDto[] {
    const parsed = limit !== undefined ? Number.parseInt(limit, 10) : 20;
    const safe = Number.isFinite(parsed) ? parsed : 20;
    return this.segmentDeltaSignalBridge.getRecent(safe);
  }
}
