import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.active) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    const payload = { sub: user.id, username: user.username, role: user.role };
    const token = await this.jwt.signAsync(payload);
    await this.prisma.auditLog.create({
      data: { action: 'login', entity: 'User', entityId: user.id, userId: user.id },
    });
    return {
      token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true, role: true, active: true },
    });
    if (!user) throw new UnauthorizedException('هذا المستخدم غير مصرح له');
    return user;
  }
}
