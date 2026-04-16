import { DeltaChangeType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class SegmentDeltaHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  runId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ nullable: true })
  customerEmail!: string | null;

  @ApiProperty({ enum: DeltaChangeType, enumName: 'DeltaChangeType' })
  changeType!: DeltaChangeType;

  @ApiProperty({ type: String, format: 'date-time' })
  effectiveAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class SegmentDeltaHistoryDto {
  @ApiProperty({ format: 'uuid' })
  segmentId!: string;

  @ApiProperty({ example: 24 })
  total!: number;

  @ApiProperty({ type: [SegmentDeltaHistoryItemDto] })
  items!: SegmentDeltaHistoryItemDto[];
}
