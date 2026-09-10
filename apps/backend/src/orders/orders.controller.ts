import { BadRequestException, Controller, Get, Post, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Orders') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private svc: OrdersService) {}
  @Get() list(@Query('status') status?: string, @Query('tab') tab?: string, @Query('orderType') orderType?: string, @Query('search') search?: string, @Query('repId') repId?: string, @Query('customer') customer?: string, @Query('orderNumber') orderNumber?: string, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.svc.list({ status, tab, orderType, search, repId, customer, orderNumber, take: take ? Number(take) : 100, skip: skip ? Number(skip) : 0 });
  }
  @Get(':id') byId(@Param('id') id: string) { return this.svc.byId(id); }
  @Post() create(@Body() dto: CreateOrderDto, @CurrentUser() u: ReqUser, @Req() req: any) {
    return this.svc.create(dto, u.id, { headers: req?.headers });
  }
  @Post(':id/hold') hold(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.svc.holdOrder(id, u.id); }
  @Post(':id/confirm') confirm(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.svc.setStatus(id, 'CONFIRMED', u.id); }
  @Post(':id/cancel') cancel(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.svc.setStatus(id, 'CANCELLED', u.id); }
  // Legacy direct-return endpoint — now routed through the same approval flow
  // as return-request (threshold + manager approval). Kept for compatibility;
  // no caller bypasses approval anymore (verified: all UIs use return-request).
  @Post(':id/return') ret(@Param('id') id: string, @CurrentUser() u: ReqUser) {
    return this.svc.requestReturn(id, { id: u.id, username: u.username, fullName: u.fullName, permissionLevel: u.permissionLevel }, undefined);
  }

  // §7 — return approval flow (cashier requests → manager approves/rejects).
  // Optional body { items: [{ orderItemId, quantity }] } for partial returns.
  @Post(':id/return-request')
  requestReturn(@Param('id') id: string, @Body() body: { items?: Array<{ orderItemId: string; quantity: number }> }, @CurrentUser() u: ReqUser) {
    return this.svc.requestReturn(id, { id: u.id, username: u.username, fullName: u.fullName, permissionLevel: u.permissionLevel }, body?.items);
  }
  @Post(':id/approve-return')
  @RequireLevel(50)
  approveReturn(@Param('id') id: string, @CurrentUser() u: ReqUser) {
    return this.svc.approveReturn(id, { id: u.id, permissionLevel: u.permissionLevel });
  }
  @Post(':id/reject-return')
  @RequireLevel(50)
  rejectReturn(@Param('id') id: string, @CurrentUser() u: ReqUser) {
    return this.svc.rejectReturn(id, { id: u.id });
  }
}

/** §1 — no-login public order page: token URL → minimal read-only details. */
@ApiTags('Public Orders')
@Controller('public/orders')
export class PublicOrdersController {
  constructor(private svc: OrdersService) {}
  @Get(':token')
  async view(@Param('token') token: string) {
    const o = await this.svc.byPublicToken(token);
    return {
      orderNumber: Number(o.orderNumber),
      createdAt: o.createdAt,
      status: o.status,
      customerName: (o as any).customer?.name || 'عميل',
      items: (o.items || []).map((i: any) => ({
        name: i.productNameSnapshot,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPriceSnapshot),
        lineTotal: Number(i.lineTotal),
      })),
      subtotal: Number(o.subtotal),
      discount: Number(o.discount),
      total: Number(o.total),
      rating: o.rating,
    };
  }

  @Post(':token/rating')
  async rate(@Param('token') token: string, @Body() body: { rating?: number; note?: string }) {
    const o = await this.svc.byPublicToken(token);
    const rating = Math.round(Number(body?.rating));
    if (!(rating >= 1 && rating <= 5)) throw new BadRequestException('التقييم يجب أن يكون بين 1 و 5');
    const updated = await this.svc.rateOrder(o.id, rating, String(body?.note || '').slice(0, 280));
    return { ok: true, rating: updated.rating };
  }
}
