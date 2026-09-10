import { Controller, Post, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, ChangePasswordDto } from './dto';
import { AuthGuard } from '../common/auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  // Per-IP backstop (60/min) beside the per-username lockout in AuthService.
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('login') login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }
  @Get('me') @ApiBearerAuth() @UseGuards(AuthGuard) me(@Req() req: any) {
    return this.auth.me(req.user.id);
  }
  @Post('logout') @ApiBearerAuth() @UseGuards(AuthGuard) logout(@Req() req: any) {
    return this.auth.logout(req.user.id);
  }
  @Patch('password') @ApiBearerAuth() @UseGuards(AuthGuard) changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
