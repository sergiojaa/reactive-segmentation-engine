import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SegmentDeltaHistoryDto } from './dto/segment-delta-history.dto';
import { SegmentEvaluationRunHistoryDto } from './dto/segment-evaluation-run-history.dto';
import { SegmentEvaluationResultDto } from './dto/segment-evaluation-result.dto';
import { SegmentMembershipSnapshotDto } from './dto/segment-membership-snapshot.dto';
import { SegmentEvaluationService } from './segment-evaluation.service';

@ApiTags('segment-evaluation')
@Controller('segment-evaluation')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SegmentEvaluationController {
  constructor(
    private readonly segmentEvaluationService: SegmentEvaluationService,
  ) {}

  @Post(':id/evaluate')
  @ApiOperation({
    summary: 'Force direct dynamic evaluation of one segment',
  })
  @ApiOkResponse({ type: SegmentEvaluationResultDto })
  evaluateSegment(
    @Param('id', ParseUUIDPipe) segmentId: string,
  ): Promise<SegmentEvaluationResultDto> {
    return this.segmentEvaluationService.evaluateSegment(segmentId);
  }

  @Post(':id/refresh-static')
  @ApiOperation({
    summary: 'Manual refresh for static segment membership',
  })
  @ApiOkResponse({ type: SegmentEvaluationResultDto })
  refreshStaticSegment(
    @Param('id', ParseUUIDPipe) segmentId: string,
  ): Promise<SegmentEvaluationResultDto> {
    return this.segmentEvaluationService.refreshStaticSegment(segmentId);
  }

  @Get(':id/membership')
  @ApiOperation({
    summary: 'Get current active membership snapshot for one segment',
  })
  @ApiOkResponse({ type: SegmentMembershipSnapshotDto })
  getCurrentMembership(
    @Param('id', ParseUUIDPipe) segmentId: string,
  ): Promise<SegmentMembershipSnapshotDto> {
    return this.segmentEvaluationService.getCurrentMembership(segmentId);
  }

  @Get(':id/deltas')
  @ApiOperation({
    summary: 'Get membership delta history for one segment',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max rows to return (1-200)',
    example: 50,
  })
  @ApiOkResponse({ type: SegmentDeltaHistoryDto })
  getDeltaHistory(
    @Param('id', ParseUUIDPipe) segmentId: string,
    @Query('limit') limit?: string,
  ): Promise<SegmentDeltaHistoryDto> {
    return this.segmentEvaluationService.getSegmentDeltaHistory(
      segmentId,
      this.parseLimit(limit),
    );
  }

  @Get(':id/runs')
  @ApiOperation({
    summary: 'Get evaluation run history for one segment',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max rows to return (1-200)',
    example: 50,
  })
  @ApiOkResponse({ type: SegmentEvaluationRunHistoryDto })
  getEvaluationRuns(
    @Param('id', ParseUUIDPipe) segmentId: string,
    @Query('limit') limit?: string,
  ): Promise<SegmentEvaluationRunHistoryDto> {
    return this.segmentEvaluationService.getSegmentEvaluationRuns(
      segmentId,
      this.parseLimit(limit),
    );
  }

  private parseLimit(limit: string | undefined): number {
    const parsed = limit !== undefined ? Number.parseInt(limit, 10) : 50;
    if (!Number.isFinite(parsed)) {
      return 50;
    }
    return Math.max(1, Math.min(200, parsed));
  }
}
