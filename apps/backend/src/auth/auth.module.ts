import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../common/auth.guard';
import { getJwtExpiresIn, getJwtSecret } from '../common/jwt-secret';

@Module({
  imports: [JwtModule.register({ secret: getJwtSecret(), signOptions: { expiresIn: getJwtExpiresIn() as any } })],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, AuthGuard],
  exports: [JwtModule, AuthGuard],
})
export class AuthModule {}
