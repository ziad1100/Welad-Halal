import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import { AuthGuard } from '../common/auth.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Purchases') @ApiBearerAuth() @UseGuards(AuthGuard) @Roles('ADMIN','MANAGER')
@Controller('purchases')
export class PurchasesController {
  constructor(private svc: PurchasesService) {}
  @Get() list() { return this.svc.list(); }
  @Post() create(@Body() dto: any, @CurrentUser() u: ReqUser) { return this.svc.create(dto, u.id); }
}
