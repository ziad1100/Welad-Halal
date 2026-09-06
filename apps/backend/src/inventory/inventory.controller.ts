import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { StockTakeService } from './stocktake.service';
import { AdjustDto, SetStockDto } from './dto';
import { CreateTakeDto, CountLinesDto, CreateBatchDto } from './stocktake.dto';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Inventory') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private svc: InventoryService, private takes: StockTakeService) {}
  @Get() list(@Query('low') low?: string) { return this.svc.list(low === 'true'); }
  @Get('movements') movements(@Query('productId') p?: string) { return this.svc.movements(p); }
  @Post('adjust') @RequireLevel(50) adjust(@Body() dto: AdjustDto, @CurrentUser() u: ReqUser) { return this.svc.adjust(dto.productId, dto.quantity, u.id, dto.notes); }
  @Post('set') @RequireLevel(50) set(@Body() dto: SetStockDto, @CurrentUser() u: ReqUser) { return this.svc.setStock(dto.productId, dto.quantity, u.id, dto.notes); }

  @Get('batches') batches(@Query('productId') p?: string) { return this.takes.batches(p); }
  @Post('batches') @RequireLevel(50) addBatch(@Body() dto: CreateBatchDto, @CurrentUser() u: ReqUser) { return this.takes.addBatch(dto, u.id); }
  @Get('expiring') expiring(@Query('days') d?: string) { return this.takes.expiring(d ? Number(d) : 7); }

  @Get('stocktakes') @RequireLevel(50) takesList() { return this.takes.list(); }
  @Post('stocktakes') @RequireLevel(50) openTake(@Body() dto: CreateTakeDto, @CurrentUser() u: ReqUser) { return this.takes.open(dto.name, u.id); }
  @Get('stocktakes/:id') @RequireLevel(50) takeDetail(@Param('id') id: string) { return this.takes.detail(id); }
  @Patch('stocktakes/:id/lines') @RequireLevel(50) countLines(@Param('id') id: string, @Body() dto: CountLinesDto) { return this.takes.count(id, dto.lines); }
  @Post('stocktakes/:id/commit') @RequireLevel(50) commitTake(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.takes.commit(id, u.id); }
  @Post('stocktakes/:id/cancel') @RequireLevel(50) cancelTake(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.takes.cancel(id, u.id); }
}
