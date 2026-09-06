import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto';
import { AuthGuard } from '../common/auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post('login') login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }
  @Get('me') @ApiBearerAuth() @UseGuards(AuthGuard) me(@Req() req: any) {
    return this.auth.me(req.user.id);
  }
}
