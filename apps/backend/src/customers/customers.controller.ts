import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { UpsertCustomerDto } from './dto';
import { AuthGuard } from '../common/auth.guard';

@ApiTags('Customers') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private svc: CustomersService) {}
  @Get() list(@Query('search') s?: string) { return this.svc.list(s); }
  @Get(':id') byId(@Param('id') id: string) { return this.svc.byId(id); }
  @Post() create(@Body() dto: UpsertCustomerDto) { return this.svc.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpsertCustomerDto) { return this.svc.update(id, dto); }
}
