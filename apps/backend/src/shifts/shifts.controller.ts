import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto, CloseShiftDto } from './dto';

@ApiTags('Shifts') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('shifts')
export class ShiftsController {
  constructor(private svc: ShiftsService) {}

  @Post('open')
  open(@Body() dto: OpenShiftDto, @CurrentUser() u: ReqUser) {
    return this.svc.open(u.id, dto);
  }

  @Get('me/current')
  async current(@CurrentUser() u: ReqUser) {
    return { shift: await this.svc.currentForUser(u.id) };
  }

  @Get('me/current/expected')
  async currentExpected(@CurrentUser() u: ReqUser) {
    const shift = await this.svc.currentForUser(u.id);
    if (!shift) return { shift: null, expectedCash: 0, sales: 0, refunds: 0 };
    const expected = await this.svc.expectedCash(shift.id);
    return { shift, ...expected };
  }

  @Post(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseShiftDto, @CurrentUser() u: ReqUser) {
    return this.svc.close(id, dto, { id: u.id, permissionLevel: u.permissionLevel });
  }

  @Get()
  @RequireLevel(50)
  history(@Query('employeeId') employeeId?: string, @Query('status') status?: string, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.svc.list({ employeeId, status, take: take ? Number(take) : 100, skip: skip ? Number(skip) : 0 });
  }

  @Get('employees')
  @RequireLevel(50)
  employees() {
    return this.svc.employeesWithShifts();
  }

  @Get(':id/expected')
  async expected(@Param('id') id: string, @CurrentUser() u: ReqUser) {
    const mine = await this.svc.currentForUser(u.id);
    if (!mine || mine.id !== id) {
      // Managers/owners may inspect any shift; employees only their own open one.
      if (u.permissionLevel < 50) throw new ForbiddenException('لا يمكنك الاطلاع على شيفت آخر');
    }
    const e = await this.svc.expectedCash(id);
    return { shiftId: id, ...e };
  }
}
