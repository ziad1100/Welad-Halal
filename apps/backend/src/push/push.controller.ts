import { Body, Controller, Delete, Get, Post, UseGuards, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser, ReqUser } from '../common/current-user';
import { PushService } from './push.service';

@ApiTags('Push') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('push')
export class PushController {
  constructor(private svc: PushService) {}

  @Get('config')
  config() {
    return { vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' };
  }

  @Post('subscribe')
  subscribe(@Body() body: { endpoint: string; keys: { p256dh: string; auth: string } }, @CurrentUser() u: ReqUser, @Headers('user-agent') ua?: string) {
    return this.svc.subscribe(u.id, body, ua);
  }

  @Delete('unsubscribe')
  unsubscribe(@Body() body: { endpoint: string }) {
    return this.svc.unsubscribe(body?.endpoint || '');
  }
}
