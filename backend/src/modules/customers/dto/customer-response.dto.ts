import { CustomerStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '5d8c4284-f973-4df9-aef6-f634653bdc1a',
  })
  id!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'crm_12345',
  })
  externalId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'john.doe@example.com',
  })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'John' })
  firstName!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Doe' })
  lastName!: string | null;

  @ApiProperty({
    enum: CustomerStatus,
    enumName: 'CustomerStatus',
  })
  status!: CustomerStatus;

  @ApiPropertyOptional({ nullable: true, example: 'US' })
  country!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'New York' })
  city!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
  })
  dateOfBirth!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    example: { loyaltyTier: 'gold', preferredLanguage: 'en' },
  })
  attributes!: Record<string, unknown> | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
