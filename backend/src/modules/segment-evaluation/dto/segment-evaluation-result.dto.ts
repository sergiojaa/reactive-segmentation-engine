import { ApiProperty } from '@nestjs/swagger';

export class SegmentEvaluationResultDto {
  @ApiProperty({
    format: 'uuid',
    example: '6b8bfc5a-f096-481d-bf99-51af8e6f768d',
  })
  segmentId!: string;

  @ApiProperty({
    example: 'ACTIVE_BUYERS',
    description: 'Resolved direct dynamic rule type',
  })
  ruleType!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Effective current time used by evaluation',
  })
  effectiveNow!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Timestamp when evaluation completed',
  })
  evaluatedAt!: Date;

  @ApiProperty({
    type: [String],
    description: 'Matching customer ids for this evaluation snapshot',
    example: [
      '8af4bb0d-5b01-4dd2-8588-f6785ce5b1ea',
      'd9d0f46a-3e20-4f3b-b257-d9af4cc0db63',
    ],
  })
  customerIds!: string[];
}
