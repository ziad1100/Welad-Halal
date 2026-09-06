import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { UpsertEmployeeDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Employees') @ApiBearerAuth() @UseGuards(AuthGuard) @Roles('ADMIN', 'MANAGER')
@Controller('employees')
export class EmployeesController {
  constructor(private svc: EmployeesService) {}
  @Get() list() { return this.svc.list(); }
  @Post() @Roles('ADMIN') create(@Body() dto: UpsertEmployeeDto, @CurrentUser() u: ReqUser) { return this.svc.create(dto, u.id); }
  @Patch(':id') @Roles('ADMIN') update(@Param('id') id: string, @Body() dto: UpsertEmployeeDto, @CurrentUser() u: ReqUser) { return this.svc.update(id, dto, u.id); }
}
