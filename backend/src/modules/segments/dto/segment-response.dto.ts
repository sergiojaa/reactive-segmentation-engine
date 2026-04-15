import { SegmentStatus, SegmentType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SegmentResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '6b8bfc5a-f096-481d-bf99-51af8e6f768d',
  })
  id!: string;

  @ApiProperty({
    example: 'high-value-customers',
    description: 'Stable unique segment key',
  })
  key!: string;

  @ApiProperty({ example: 'High Value Customers' })
  name!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Users with spend above threshold',
  })
  description!: string | null;

  @ApiProperty({ enum: SegmentType, enumName: 'SegmentType' })
  type!: SegmentType;

  @ApiProperty({ enum: SegmentStatus, enumName: 'SegmentStatus' })
  status!: SegmentStatus;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Stored segment rules (definitionJson)',
    example: {
      operator: 'AND',
      conditions: [{ field: 'country', value: 'US' }],
    },
  })
  rules!: Record<string, unknown> | null;

  @ApiProperty({
    type: [String],
    description: 'Segment IDs referenced by stored rules',
    example: ['2fb112b8-0f61-4ef5-8d63-95aaec8bcf2b'],
  })
  dependencySegmentIds!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
