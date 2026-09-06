import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Users') @ApiBearerAuth()
@Controller('users') @UseGuards(AuthGuard) @RequireLevel(50)
export class UsersController {
  constructor(private users: UsersService) {}
  @Get('reps') @RequireLevel(10) reps() { return this.users.reps(); }
  @Get() list() { return this.users.list(); }
  @Post() create(@Body() dto: CreateUserDto, @CurrentUser() u: ReqUser) { return this.users.create(dto, u); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() u: ReqUser) { return this.users.update(id, dto, u); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() u: ReqUser) { return this.users.remove(id, u); }
}
