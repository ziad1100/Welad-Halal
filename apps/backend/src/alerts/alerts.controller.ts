import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { AlertsService } from './alerts.service';

@ApiTags('Alerts') @ApiBearerAuth() @UseGuards(AuthGuard) @RequireLevel(50)
@Controller('alerts')
export class AlertsController {
  constructor(private svc: AlertsService) {}

  @Get()
  list(@Query('unreadOnly') unreadOnly?: string, @Query('take') take?: string) {
    return this.svc.list({ unreadOnly: unreadOnly === '1' || unreadOnly === 'true', take: take ? Number(take) : 50 });
  }

  @Get('unread/count')
  unreadCount() {
    return this.svc.unreadCount();
  }

  @Post(':id/read')
  async read(@Param('id') id: string) {
    return (await this.svc.markRead(id)) ?? { ok: false };
  }

  @Post('read-all')
  markAllRead() {
    return this.svc.markAllRead();
  }
}
