import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { UpsertSupplierDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { Roles } from '../common/roles.decorator';

@ApiTags('Suppliers') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private svc: SuppliersService) {}
  @Get() list(@Query('search') s?: string) { return this.svc.list(s); }
  @Get(':id') byId(@Param('id') id: string) { return this.svc.byId(id); }
  @Post() @Roles('ADMIN', 'MANAGER') create(@Body() dto: UpsertSupplierDto) { return this.svc.create(dto); }
  @Patch(':id') @Roles('ADMIN', 'MANAGER') update(@Param('id') id: string, @Body() dto: UpsertSupplierDto) { return this.svc.update(id, dto); }
  @Delete(':id') @Roles('ADMIN', 'MANAGER') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
