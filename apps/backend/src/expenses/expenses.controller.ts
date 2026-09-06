import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Expenses') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private svc: ExpensesService) {}
  @Get() list(@Query('from') f?: string, @Query('to') t?: string) { return this.svc.list(f, t); }
  @Post() create(@Body() dto: any, @CurrentUser() u: ReqUser) { return this.svc.create(dto, u.id); }
}
