import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';
import { CreateTransactionDto } from '../../transactions/dto/create-transaction.dto';

export class SimulateTransactionDto extends OmitType(CreateTransactionDto, [
  'occurredAt',
] as const) {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      'Optional explicit transaction time. If omitted, current simulation clock time is used.',
    example: '2026-04-15T15:30:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurredAt?: Date;
}
