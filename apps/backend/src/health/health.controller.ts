import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Get() async health() {
    let migrationsApplied: number | null = null;
    try {
      const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`;
      migrationsApplied = Number(rows[0]?.count ?? 0);
    } catch { migrationsApplied = null; }
    return {
      status: 'ok',
      service: 'weladhalal-backend',
      sha: process.env.GIT_SHA || 'dev',
      migrationsApplied,
      time: new Date().toISOString(),
    };
  }
  @Get('database') async db() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch (e: any) {
      // Never leak driver messages to unauthenticated callers — log server-side.
      // eslint-disable-next-line no-console
      console.error(`[health] database check failed: ${e?.message || e}`);
      return { status: 'error', database: 'disconnected' };
    }
  }
}
