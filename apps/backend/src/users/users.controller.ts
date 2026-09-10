import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto, ChangeRoleDto, UpdatePermissionsDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { RequirePermission } from '../common/permission.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Users') @ApiBearerAuth()
@Controller('users') @UseGuards(AuthGuard) @RequireLevel(50)
export class UsersController {
  constructor(private users: UsersService) {}
  @Get('reps') @RequireLevel(10) reps() { return this.users.reps(); }
  @Get('check-username') async checkUsername(@Query('username') username: string) {
    // Object shape (not raw boolean): the Users UI reads `.available`.
    return { available: await this.users.checkUsernameAvailable(username ?? '') };
  }
  @Get() list() { return this.users.list(); }
  @Post() create(@Body() dto: CreateUserDto, @CurrentUser() u: ReqUser) { return this.users.create(dto, u); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() u: ReqUser) { return this.users.update(id, dto, u); }
  @Patch(':id/reset-password') resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @CurrentUser() u: ReqUser) { return this.users.resetPassword(id, dto, u); }
  @Patch(':id/role') changeRole(@Param('id') id: string, @Body() dto: ChangeRoleDto, @CurrentUser() u: ReqUser) { return this.users.changeRole(id, dto, u); }
  // Defense in depth: service ALSO enforces owner-only (updatePermissions).
  // Owner always carries ALL_PERMISSIONS, so owner access is unchanged;
  // non-owners were already denied by the service with the same 403.
  @Patch(':id/permissions') @RequirePermission('users.edit') updatePermissions(@Param('id') id: string, @Body() dto: UpdatePermissionsDto, @CurrentUser() u: ReqUser) { return this.users.updatePermissions(id, dto, u); }
  @Patch(':id/activate') activate(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.users.activate(id, u); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.users.remove(id, u); }
}
