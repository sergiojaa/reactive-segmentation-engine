import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdvanceSimulationTimeDto {
  @ApiProperty({
    description: 'How many seconds to move the simulation clock forward',
    example: 86400,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  seconds!: number;

  @ApiPropertyOptional({
    description: 'Optional reason shown in simulation metadata',
    example: 'Demo inactivity timeout',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
