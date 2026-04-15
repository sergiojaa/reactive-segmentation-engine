import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SegmentEvaluationResultDto } from './dto/segment-evaluation-result.dto';
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
}
