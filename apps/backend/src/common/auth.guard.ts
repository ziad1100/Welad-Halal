import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { LEVEL_KEY } from './level.decorator';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('غير مصرح — سجل الدخول أولاً');
    const token = header.slice(7);
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة أو الجلسة منتهية');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('هذا المستخدم غير مصرح له');
    req.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role, permissionLevel: user.permissionLevel, isOwner: user.isOwner };

    // Forced password change gates everything except the password-change endpoint itself.
    const path: string = req.route?.path || req.url || '';
    const isPasswordRoute = req.method === 'PATCH' && path.includes('/auth/password');
    if (user.forcePasswordChange && !isPasswordRoute) {
      throw new ForbiddenException('يجب تغيير كلمة المرور المؤقتة أولاً');
    }

    // Level-based check (numeric comparison — never role-name matching).
    const required = this.reflector.getAllAndOverride<number>(LEVEL_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (required !== undefined && user.permissionLevel < required) {
      throw new ForbiddenException('هذا المستخدم غير مصرح له');
    }
    // Legacy role check (kept for user-mgmt special cases during transition).
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('هذا المستخدم غير مصرح له');
    }
    return true;
  }
}
