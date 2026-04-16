import { SegmentType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class SegmentMembershipMemberDto {
  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  firstName!: string | null;

  @ApiProperty({ nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  addedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastEvaluatedAt!: Date | null;

  @ApiProperty()
  isManual!: boolean;
}

export class SegmentMembershipSnapshotDto {
  @ApiProperty({ format: 'uuid' })
  segmentId!: string;

  @ApiProperty({ enum: SegmentType, enumName: 'SegmentType' })
  segmentType!: SegmentType;

  @ApiProperty({ example: 12 })
  activeCount!: number;

  @ApiProperty({ type: [String], format: 'uuid' })
  customerIds!: string[];

  @ApiProperty({ type: [SegmentMembershipMemberDto] })
  members!: SegmentMembershipMemberDto[];
}
