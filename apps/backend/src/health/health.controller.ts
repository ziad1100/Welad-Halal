import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Get() health() { return { status: 'ok', service: 'kstore-backend', time: new Date().toISOString() }; }
  @Get('database') async db() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch (e: any) {
      return { status: 'error', database: 'disconnected', message: e?.message };
    }
  }
}
