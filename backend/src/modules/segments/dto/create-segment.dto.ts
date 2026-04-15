import { SegmentStatus, SegmentType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSegmentDto {
  @ApiProperty({
    description: 'Human-readable segment name',
    example: 'High Value Customers',
  })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional segment description',
    example: 'Users with total spend above 1000 in last 90 days',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    enum: SegmentType,
    enumName: 'SegmentType',
    description: 'Segment type',
    example: SegmentType.DYNAMIC,
  })
  @IsEnum(SegmentType)
  type!: SegmentType;

  @ApiPropertyOptional({
    enum: SegmentStatus,
    enumName: 'SegmentStatus',
    description: 'Segment lifecycle status',
    example: SegmentStatus.DRAFT,
    default: SegmentStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(SegmentStatus)
  status?: SegmentStatus;

  @ApiPropertyOptional({
    description: 'Structured JSON rules persisted in definitionJson',
    example: {
      operator: 'AND',
      conditions: [
        { field: 'totalSpend', operator: 'gt', value: 1000 },
        { segmentId: '2fb112b8-0f61-4ef5-8d63-95aaec8bcf2b' },
      ],
    },
  })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}
