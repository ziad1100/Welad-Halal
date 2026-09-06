import { Injectable, UnauthorizedException, HttpException, HttpStatus, ForbiddenException, BadRequestException } from '@nestjs/common';
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

  private safeUser(user: any) {
    return { id: user.id, fullName: user.fullName, username: user.username, role: user.role, permissionLevel: user.permissionLevel, isOwner: user.isOwner, forcePasswordChange: user.forcePasswordChange };
  }

  async login(username: string, password: string) {
    const name = (username || '').trim();
    const fails = await this.prisma.loginAttempt.count({
      where: { username: name, success: false, createdAt: { gte: this.windowSince() } },
    });
    if (fails >= MAX_FAILS) throw new HttpException('محاولات كثيرة — الحساب مقفل مؤقتاً، حاول بعد قليل', HttpStatus.TOO_MANY_REQUESTS);

    const user = await this.prisma.user.findUnique({ where: { username: name } });
    const ok = user?.isActive ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) {
      await this.prisma.loginAttempt.create({ data: { username: name, success: false } });
      await this.prisma.auditLog.create({ data: { action: 'login.failed', entity: 'User', entityId: user?.id, details: name } });
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    await this.prisma.loginAttempt.create({ data: { username: name, success: true } });
    // Token encodes role + level; every request re-checks against the DB row.
    const payload = { sub: user.id, username: user.username, role: user.role, permissionLevel: user.permissionLevel };
    const token = await this.jwt.signAsync(payload);
    await this.prisma.auditLog.create({
      data: { action: 'login', entity: 'User', entityId: user.id, userId: user.id },
    });
    return { token, user: this.safeUser(user) };
  }

  async changePassword(userId: string, current: string | undefined, next: string) {
    if (!next || next.length < 4) throw new BadRequestException('كلمة المرور قصيرة');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('هذا المستخدم غير مصرح له');
    // Forced-change flow may not know the temp password — owner/self with flag skips current check only via flag.
    if (!user.forcePasswordChange) {
      if (!current || !(await bcrypt.compare(current, user.passwordHash))) {
        throw new ForbiddenException('كلمة المرور الحالية غير صحيحة');
      }
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(next, 10), forcePasswordChange: false },
    });
    await this.prisma.auditLog.create({ data: { action: 'password.change', entity: 'User', entityId: userId, userId } });
    return this.safeUser(updated);
  }

  async logout(userId: string) {
    await this.prisma.auditLog.create({ data: { action: 'logout', entity: 'User', entityId: userId, userId } });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('هذا المستخدم غير مصرح له');
    return this.safeUser(user);
  }
}
