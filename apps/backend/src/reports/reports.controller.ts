import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';

@ApiTags('Reports') @ApiBearerAuth() @UseGuards(AuthGuard) @RequireLevel(50)
@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService) {}
  @Get('sales') sales(@Query('from') f?: string, @Query('to') t?: string) { return this.svc.sales(f, t); }
  @Get('products') products(@Query('from') f?: string, @Query('to') t?: string) { return this.svc.products(f, t); }
  @Get('inventory') inventory() { return this.svc.inventory(); }
  @Get('daily') daily(@Query('date') d?: string) { return this.svc.daily(d); }
}
