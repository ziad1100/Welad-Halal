import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../common/auth.guard';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-secret-change-me-min-32-chars-please', signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN as any) || '8h' } })],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, AuthGuard],
  exports: [JwtModule, AuthGuard],
})
export class AuthModule {}
