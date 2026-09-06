import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { AdjustDto, SetStockDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Inventory') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private svc: InventoryService) {}
  @Get() list(@Query('low') low?: string) { return this.svc.list(low === 'true'); }
  @Get('movements') movements(@Query('productId') p?: string) { return this.svc.movements(p); }
  @Post('adjust') @Roles('ADMIN','MANAGER') adjust(@Body() dto: AdjustDto, @CurrentUser() u: ReqUser) { return this.svc.adjust(dto.productId, dto.quantity, u.id, dto.notes); }
  @Post('set') @Roles('ADMIN','MANAGER') set(@Body() dto: SetStockDto, @CurrentUser() u: ReqUser) { return this.svc.setStock(dto.productId, dto.quantity, u.id, dto.notes); }
}
