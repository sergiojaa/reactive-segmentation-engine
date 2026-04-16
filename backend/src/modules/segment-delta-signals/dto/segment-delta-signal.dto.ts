import { ApiProperty } from '@nestjs/swagger';

export class SegmentDeltaSignalDto {
  @ApiProperty({ format: 'uuid' })
  segmentId!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Segment evaluation run id when the delta is tied to a run',
  })
  evaluationRunId!: string | null;

  @ApiProperty({ type: [String], format: 'uuid' })
  addedCustomerIds!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  removedCustomerIds!: string[];

  @ApiProperty({ example: 2 })
  addedCount!: number;

  @ApiProperty({ example: 1 })
  removedCount!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'ISO 8601 timestamp when the delta signal was emitted',
  })
  timestamp!: string;
}
