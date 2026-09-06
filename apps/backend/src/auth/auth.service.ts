import { Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

const MAX_FAILS = 5;
const WINDOW_MIN = 10;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private windowSince() {
    return new Date(Date.now() - WINDOW_MIN * 60 * 1000);
  }

  async login(username: string, password: string) {
    const name = (username || '').trim();
    const fails = await this.prisma.loginAttempt.count({
      where: { username: name, success: false, createdAt: { gte: this.windowSince() } },
    });
    if (fails >= MAX_FAILS) throw new HttpException('محاولات كثيرة — الحساب مقفل مؤقتاً، حاول بعد قليل', HttpStatus.TOO_MANY_REQUESTS);

    const user = await this.prisma.user.findUnique({ where: { username: name } });
    const ok = user?.active ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) {
      await this.prisma.loginAttempt.create({ data: { username: name, success: false } });
      await this.prisma.auditLog.create({ data: { action: 'login.failed', entity: 'User', entityId: user?.id, details: name } });
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    await this.prisma.loginAttempt.create({ data: { username: name, success: true } });
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

  async logout(userId: string) {
    await this.prisma.auditLog.create({ data: { action: 'logout', entity: 'User', entityId: userId, userId } });
    return { ok: true };
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
