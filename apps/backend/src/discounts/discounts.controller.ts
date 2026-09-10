import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';
import { DiscountsService } from './discounts.service';
import { DiscountCodeDto } from './dto';

@ApiTags('Discounts') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('discount-codes')
export class DiscountsController {
  constructor(private svc: DiscountsService) {}

  /** Cashier preview (any authenticated user) — server-authoritative amount. */
  @Get('preview')
  async preview(@Query('code') code?: string, @Query('subtotal') subtotal?: string) {
    return this.svc.preview(code || '', Number(subtotal || 0));
  }

  @Get()
  @RequireLevel(50)
  list() {
    return this.svc.list();
  }

  @Post()
  @RequireLevel(50)
  create(@Body() dto: DiscountCodeDto, @CurrentUser() u: ReqUser) {
    return this.svc.create(dto, u.id);
  }

  @Patch(':id')
  @RequireLevel(50)
  update(@Param('id') id: string, @Body() dto: Partial<DiscountCodeDto>, @CurrentUser() u: ReqUser) {
    return this.svc.update(id, dto, u.id);
  }

  @Delete(':id')
  @RequireLevel(50)
  remove(@Param('id') id: string, @CurrentUser() u: ReqUser) {
    return this.svc.remove(id, u.id);
  }
}
