import {
  EvaluationRunStatus,
  EvaluationScopeType,
  EvaluationTriggerType,
  Prisma,
} from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class SegmentEvaluationRunHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  parentRunId!: string | null;

  @ApiProperty({
    enum: EvaluationTriggerType,
    enumName: 'EvaluationTriggerType',
  })
  triggerType!: EvaluationTriggerType;

  @ApiProperty({ enum: EvaluationScopeType, enumName: 'EvaluationScopeType' })
  scopeType!: EvaluationScopeType;

  @ApiProperty({ enum: EvaluationRunStatus, enumName: 'EvaluationRunStatus' })
  status!: EvaluationRunStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ nullable: true })
  statisticsJson!: Prisma.JsonValue | null;
}

export class SegmentEvaluationRunHistoryDto {
  @ApiProperty({ format: 'uuid' })
  segmentId!: string;

  @ApiProperty({ example: 10 })
  total!: number;

  @ApiProperty({ type: [SegmentEvaluationRunHistoryItemDto] })
  items!: SegmentEvaluationRunHistoryItemDto[];
}
