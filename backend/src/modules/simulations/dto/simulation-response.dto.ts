import { ApiProperty } from '@nestjs/swagger';
import { CustomerResponseDto } from '../../customers/dto/customer-response.dto';
import { TransactionResponseDto } from '../../transactions/dto/transaction-response.dto';

class SimulationPipelineInfoDto {
  @ApiProperty({
    example:
      'Write API -> DataChangeEvent -> SegmentRecalculationProcessor -> Dynamic segment evaluation',
  })
  path!: string;

  @ApiProperty({
    example:
      'Static segments are not auto-recomputed by DataChangeEvent processing.',
  })
  staticSegmentsNote!: string;
}

export class SimulatedTransactionResponseDto {
  @ApiProperty({ example: 'transaction-added' })
  action!: string;

  @ApiProperty({ type: TransactionResponseDto })
  transaction!: TransactionResponseDto;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-04-16T10:00:00.000Z',
  })
  simulationNow!: Date;

  @ApiProperty({ type: SimulationPipelineInfoDto })
  pipeline!: SimulationPipelineInfoDto;
}

export class SimulatedCustomerUpdateResponseDto {
  @ApiProperty({ example: 'customer-updated' })
  action!: string;

  @ApiProperty({ type: CustomerResponseDto })
  customer!: CustomerResponseDto;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-04-16T10:00:00.000Z',
  })
  simulationNow!: Date;

  @ApiProperty({ type: SimulationPipelineInfoDto })
  pipeline!: SimulationPipelineInfoDto;
}

export class AdvancedSimulationTimeResponseDto {
  @ApiProperty({ example: 'time-advanced' })
  action!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-04-16T10:00:00.000Z',
  })
  previousTime!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-04-17T10:00:00.000Z',
  })
  currentTime!: Date;

  @ApiProperty({ example: 86400 })
  advancedBySeconds!: number;

  @ApiProperty({ type: SimulationPipelineInfoDto })
  pipeline!: SimulationPipelineInfoDto;
}
