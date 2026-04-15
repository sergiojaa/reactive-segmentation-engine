import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  getLiveness(): { status: 'ok' } {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  async getReadiness(): ReturnType<HealthService['getReadiness']> {
    return this.healthService.getReadiness();
  }
}
