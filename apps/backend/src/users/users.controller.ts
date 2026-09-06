import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Users') @ApiBearerAuth()
@Controller('users') @UseGuards(AuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}
  @Get('reps') reps() { return this.users.reps(); }
  @Get() @Roles('ADMIN') list(@Query('role') role?: string) { return this.users.list(role); }
  @Post() @Roles('ADMIN') create(@Body() dto: CreateUserDto, @CurrentUser() u: ReqUser) { return this.users.create(dto, u.id); }
  @Patch(':id') @Roles('ADMIN') update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() u: ReqUser) { return this.users.update(id, dto, u.id); }
}
