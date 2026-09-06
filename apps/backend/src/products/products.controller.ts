import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { UpsertProductDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Products') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private svc: ProductsService) {}
  @Get() list(@Query('search') s?: string, @Query('categoryId') c?: string, @Query('active') a?: string) {
    return this.svc.list(s, c, a !== 'false');
  }
  @Get('barcode/:barcode') byBarcode(@Param('barcode') b: string) { return this.svc.byBarcode(b); }
  @Get(':id') byId(@Param('id') id: string) { return this.svc.byId(id); }
  @Post() @Roles('ADMIN','MANAGER') create(@Body() dto: UpsertProductDto, @CurrentUser() u: ReqUser) { return this.svc.create(dto, u.id); }
  @Patch(':id') @Roles('ADMIN','MANAGER') update(@Param('id') id: string, @Body() dto: UpsertProductDto, @CurrentUser() u: ReqUser) { return this.svc.update(id, dto, u.id); }
  @Delete(':id') @Roles('ADMIN','MANAGER') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
