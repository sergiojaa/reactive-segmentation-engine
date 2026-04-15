import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SimulationsService {
  private static readonly GLOBAL_CLOCK_KEY = 'global';

  constructor(private readonly prisma: PrismaService) {}

  async getEffectiveNow(): Promise<Date> {
    const clock = await this.prisma.simulationClock.findUnique({
      where: { key: SimulationsService.GLOBAL_CLOCK_KEY },
      select: { currentTime: true },
    });

    return clock?.currentTime ?? new Date();
  }
}
