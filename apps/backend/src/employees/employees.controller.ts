import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { UpsertEmployeeDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Employees') @ApiBearerAuth() @UseGuards(AuthGuard) @RequireLevel(50)
@Controller('employees')
export class EmployeesController {
  constructor(private svc: EmployeesService) {}
  @Get() list() { return this.svc.list(); }
  @Post() @RequireLevel(50) create(@Body() dto: UpsertEmployeeDto, @CurrentUser() u: ReqUser) { return this.svc.create(dto, u); }
  @Patch(':id') @RequireLevel(50) update(@Param('id') id: string, @Body() dto: UpsertEmployeeDto, @CurrentUser() u: ReqUser) { return this.svc.update(id, dto, u); }
}
