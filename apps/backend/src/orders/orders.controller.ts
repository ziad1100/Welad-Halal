import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Orders') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private svc: OrdersService) {}
  @Get() list(@Query('status') status?: string, @Query('tab') tab?: string, @Query('orderType') orderType?: string, @Query('search') search?: string, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.svc.list({ status, tab, orderType, search, take: take ? Number(take) : 100, skip: skip ? Number(skip) : 0 });
  }
  @Get(':id') byId(@Param('id') id: string) { return this.svc.byId(id); }
  @Post() create(@Body() dto: CreateOrderDto, @CurrentUser() u: ReqUser) { return this.svc.create(dto, u.id); }
  @Post(':id/hold') hold(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.svc.setStatus(id, 'CONFIRMED', u.id).catch(() => this.svc.byId(id)); }
  @Post(':id/confirm') confirm(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.svc.setStatus(id, 'CONFIRMED', u.id); }
  @Post(':id/cancel') cancel(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.svc.setStatus(id, 'CANCELLED', u.id); }
  @Post(':id/return') ret(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.svc.returnOrder(id, u.id); }
}
