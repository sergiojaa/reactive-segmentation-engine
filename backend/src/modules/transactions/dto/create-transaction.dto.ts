import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Related customer identifier',
    example: '5d8c4284-f973-4df9-aef6-f634653bdc1a',
  })
  @IsUUID('4')
  customerId!: string;

  @ApiPropertyOptional({
    description: 'Optional id from external system',
    example: 'txn_12345',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalId?: string;

  @ApiProperty({
    description: 'Business transaction type',
    example: 'PURCHASE',
  })
  @IsString()
  @MaxLength(255)
  type!: string;

  @ApiProperty({
    description: 'Decimal amount with up to 2 digits',
    example: '149.99',
  })
  @IsString()
  @Matches(/^-?\d+(\.\d{1,2})?$/)
  amount!: string;

  @ApiProperty({
    description: '3-letter ISO currency',
    example: 'USD',
  })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-04-15T15:30:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  occurredAt!: Date;

  @ApiPropertyOptional({
    description: 'Raw transaction payload',
    example: { channel: 'mobile', merchantCategory: 'fashion' },
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
