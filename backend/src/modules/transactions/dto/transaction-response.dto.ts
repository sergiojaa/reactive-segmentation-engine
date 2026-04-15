import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransactionResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'a2ac518f-04f6-4610-b289-48c03c9b1eb4',
  })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'txn_12345',
  })
  externalId!: string | null;

  @ApiProperty({
    example: 'PURCHASE',
  })
  type!: string;

  @ApiProperty({
    example: '149.99',
  })
  amount!: string;

  @ApiProperty({
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  occurredAt!: Date;

  @ApiPropertyOptional({
    nullable: true,
    example: { channel: 'mobile', merchantCategory: 'fashion' },
  })
  payload!: Record<string, unknown> | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
