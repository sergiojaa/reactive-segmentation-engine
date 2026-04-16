import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdateCustomerDto } from '../customers/dto/update-customer.dto';
import { AdvanceSimulationTimeDto } from './dto/advance-simulation-time.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';
import {
  AdvancedSimulationTimeResponseDto,
  SimulatedCustomerUpdateResponseDto,
  SimulatedTransactionResponseDto,
} from './dto/simulation-response.dto';
import { SimulationsService } from './simulations.service';

@ApiTags('simulations')
@Controller('simulations')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SimulationsController {
  constructor(private readonly simulationsService: SimulationsService) {}

  @Post('transactions')
  @ApiOperation({
    summary:
      'Simulate transaction creation using the normal write and recalculation pipeline',
  })
  @ApiOkResponse({ type: SimulatedTransactionResponseDto })
  simulateTransaction(
    @Body() dto: SimulateTransactionDto,
  ): Promise<SimulatedTransactionResponseDto> {
    return this.simulationsService.simulateTransaction(dto);
  }

  @Patch('customers/:id')
  @ApiOperation({
    summary:
      'Simulate customer field update using the normal write and recalculation pipeline',
  })
  @ApiOkResponse({ type: SimulatedCustomerUpdateResponseDto })
  simulateCustomerUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<SimulatedCustomerUpdateResponseDto> {
    return this.simulationsService.simulateCustomerUpdate(id, dto);
  }

  @Post('time/advance')
  @ApiOperation({
    summary:
      'Advance simulation clock forward and trigger normal recalculation pipeline',
  })
  @ApiOkResponse({ type: AdvancedSimulationTimeResponseDto })
  advanceTime(
    @Body() dto: AdvanceSimulationTimeDto,
  ): Promise<AdvancedSimulationTimeResponseDto> {
    return this.simulationsService.advanceTime(dto);
  }
}
