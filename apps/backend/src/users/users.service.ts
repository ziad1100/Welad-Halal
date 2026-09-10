import { Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto, ChangeRoleDto, UpdatePermissionsDto } from './dto';
import { normalizeUsername } from '../common/username';
import { ROLE_LEVEL, type RoleName } from '../common/level.decorator';
import type { ReqUser } from '../common/current-user';
import { PERMISSIONS, ALL_PERMISSIONS } from '../common/permissions';

// No email field: username is a plain name-based identifier (unique, min 3 chars).
const SAFE = { id: true, fullName: true, username: true, role: true, permissionLevel: true, isOwner: true, isActive: true, forcePasswordChange: true, createdByUserId: true, phone: true, email: true, lastLoginAt: true, permissions: true, createdAt: true } as const;

function tempPassword(): string {
  return 'WH-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({ select: { ...SAFE }, orderBy: { createdAt: 'desc' } });
  }

  reps() {
    return this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, fullName: true, username: true }, orderBy: { fullName: 'asc' } });
  }

  async checkUsernameAvailable(raw: string): Promise<boolean> {
    const username = normalizeUsername(raw);
    if (username.length < 3) return false;
    const exists = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    return !exists;
  }

  private async target(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  /** Part 8 matrix: who may mutate whom (viewed = target, actor = requester). */
  private canMutate(actor: ReqUser, target: { id: string; role: string; isOwner: boolean }): boolean {
    if (actor.isOwner) return target.id !== actor.id ? true : true; // owner: anyone; own row handled below
    if (actor.id === target.id) return true; // self name only (enforced in update)
    if (actor.role === 'manager' && (target.role as string) === 'employee') return true;
    return false;
  }

  async create(dto: CreateUserDto, actor: ReqUser) {
    // Only owner/manager reach here (route level 50); owner creation is never allowed via form.
    const role = (dto.role as RoleName) || 'employee';
    if (role !== 'manager' && role !== 'employee') throw new ForbiddenException('لا يمكن إنشاء هذا النوع من الحسابات');
    // Never assign a level higher than your own (manager→manager equal is allowed).
    if (ROLE_LEVEL[role] > actor.permissionLevel) throw new ForbiddenException('لا يمكنك منح صلاحية أعلى من صلاحيتك');
    // Normalize (trim + collapse internal spaces) before the uniqueness check.
    const username = normalizeUsername(dto.username);
    if (username.length < 3) throw new BadRequestException('اسم المستخدم قصير جداً (3 أحرف على الأقل)');
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new ConflictException('اسم المستخدم مستخدم بالفعل');
    // Confirm password validation.
    if (!dto.generatePassword && dto.password && dto.confirmPassword && dto.password !== dto.confirmPassword) {
      throw new BadRequestException('تأكيد كلمة المرور غير متطابق');
    }
    const generated = dto.generatePassword || !dto.password;
    const plain = generated ? tempPassword() : dto.password!;
    if (!generated && plain.length < 4) throw new BadRequestException('كلمة المرور قصيرة');
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName, username,
        passwordHash: await bcrypt.hash(plain, 10),
        role, permissionLevel: ROLE_LEVEL[role],
        createdByUserId: actor.id, forcePasswordChange: generated,
        phone: dto.phone || null, email: dto.email || null,
      },
      select: { ...SAFE },
    });
    await this.prisma.auditLog.create({ data: { action: 'user.create', entity: 'User', entityId: user.id, details: `${actor.username} -> ${role}`, userId: actor.id } });
    return generated ? { ...user, temporaryPassword: plain } : user;
  }

  async update(id: string, dto: UpdateUserDto, actor: ReqUser) {
    const target = await this.target(id);
    // Owner row: immutable to everyone except the owner themself (name/phone/email only).
    if (target.isOwner && actor.id !== target.id) throw new ForbiddenException('حساب المالك لا يمكن تعديله');
    if (actor.id === target.id) {
      if (dto.role !== undefined || (dto as any).permissionLevel !== undefined) throw new ForbiddenException('لا يمكنك تغيير دورك بنفسك');
      if (target.isOwner && dto.isActive === false) throw new ForbiddenException('لا يمكن تعطيل حساب المالك');
      // Self-update: fullName, phone, email only.
      const updated = await this.prisma.user.update({
        where: { id },
        data: {
          fullName: dto.fullName ?? undefined,
          phone: dto.phone !== undefined ? dto.phone || null : undefined,
          email: dto.email !== undefined ? dto.email || null : undefined,
        },
        select: { ...SAFE },
      });
      await this.prisma.auditLog.create({ data: { action: 'user.update', entity: 'User', entityId: id, details: 'self', userId: actor.id } });
      return updated;
    }
    if (!this.canMutate(actor, target)) throw new ForbiddenException('هذا المستخدم غير مصرح له');
    if (dto.role !== undefined && (dto.role !== 'manager' && dto.role !== 'employee')) throw new ForbiddenException('لا يمكن إنشاء هذا النوع من الحسابات');
    if (dto.role !== undefined && ROLE_LEVEL[dto.role] > actor.permissionLevel) throw new ForbiddenException('لا يمكنك منح صلاحية أعلى من صلاحيتك');
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName ?? undefined,
        phone: dto.phone !== undefined ? dto.phone || null : undefined,
        email: dto.email !== undefined ? dto.email || null : undefined,
        ...(dto.role !== undefined ? { role: dto.role, permissionLevel: ROLE_LEVEL[dto.role] } : {}),
        isActive: dto.isActive ?? undefined,
      },
      select: { ...SAFE },
    });
    await this.prisma.auditLog.create({ data: { action: 'user.update', entity: 'User', entityId: id, details: `by ${actor.username}`, userId: actor.id } });
    return updated;
  }

  async resetPassword(id: string, dto: ResetPasswordDto, actor: ReqUser) {
    const target = await this.target(id);
    // Only Owner can change Owner's own password — and only via /auth/password, not this endpoint.
    if (target.isOwner) throw new ForbiddenException('حساب المالك — استخدم تغيير كلمة المرور من ملفك الشخصي');
    // Self-reset is not allowed via this endpoint — must go through PATCH /auth/password.
    if (actor.id === target.id) throw new ForbiddenException('لتغيير كلمة المرور الخاصة بك، استخدم خيار تغيير كلمة المرور من ملفك الشخصي');
    // Permission matrix: Owner→anyone, Manager→employees only.
    if (!this.canMutate(actor, target)) throw new ForbiddenException('هذا المستخدم غير مصرح له');

    const hasPassword = !!dto.password;
    const hasGenerate = !!dto.generateTempPassword;
    if (hasPassword === hasGenerate) throw new BadRequestException('حدد كلمة مرور جديدة أو اختر التوليد التلقائي');

    let plain: string;
    let forceChange: boolean;
    if (hasGenerate) {
      plain = tempPassword();
      forceChange = true;
    } else {
      plain = dto.password!;
      if (plain.length < 4) throw new BadRequestException('كلمة المرور قصيرة (4 أحرف على الأقل)');
      forceChange = false;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(plain, 10), forcePasswordChange: forceChange },
      select: { ...SAFE },
    });
    const method = hasGenerate ? 'generated' : 'manual';
    await this.prisma.auditLog.create({
      data: { action: 'user.password_reset', entity: 'User', entityId: id, details: `by ${actor.username} for ${target.username} (${method})`, userId: actor.id },
    });
    return hasGenerate ? { ...updated, temporaryPassword: plain } : updated;
  }

  async changeRole(id: string, dto: ChangeRoleDto, actor: ReqUser) {
    const target = await this.target(id);
    if (target.isOwner) throw new ForbiddenException('لا يمكن تغيير دور حساب المالك');
    if (actor.id === target.id) throw new ForbiddenException('لا يمكنك تغيير دورك بنفسك');
    if (!this.canMutate(actor, target)) throw new ForbiddenException('هذا المستخدم غير مصرح له');
    const newRole = dto.role as RoleName;
    if (ROLE_LEVEL[newRole] > actor.permissionLevel) throw new ForbiddenException('لا يمكنك منح صلاحية أعلى من صلاحيتك');
    const oldRole = target.role;
    if (oldRole === newRole) return this.target(id); // no change
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: newRole, permissionLevel: ROLE_LEVEL[newRole] },
      select: { ...SAFE },
    });
    await this.prisma.auditLog.create({
      data: { action: 'user.role_change', entity: 'User', entityId: id, details: `${oldRole} -> ${newRole} by ${actor.username}`, userId: actor.id },
    });
    return updated;
  }

  async updatePermissions(id: string, dto: UpdatePermissionsDto, actor: ReqUser) {
    const target = await this.target(id);
    if (target.isOwner) throw new ForbiddenException('صلاحيات المالك ثابتة ولا يمكن تغييرها');
    if (actor.id === target.id) throw new ForbiddenException('لا يمكنك تغيير صلاحياتك بنفسك');
    // Only Owner can manage permissions.
    if (!actor.isOwner) throw new ForbiddenException('فقط المالك يمكنه إدارة الصلاحيات');
    // Validate all permission strings.
    const validPerms = new Set(PERMISSIONS);
    const invalid = dto.permissions.filter((p) => !validPerms.has(p as any));
    if (invalid.length) throw new BadRequestException(`صلاحيات غير صالحة: ${invalid.join(', ')}`);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { permissions: dto.permissions },
      select: { ...SAFE },
    });
    await this.prisma.auditLog.create({
      data: { action: 'user.permission_change', entity: 'User', entityId: id, details: `${dto.permissions.length} perms by ${actor.username}`, userId: actor.id },
    });
    return updated;
  }

  async activate(id: string, actor: ReqUser) {
    const target = await this.target(id);
    if (target.isActive) return target; // already active
    if (target.isOwner) throw new ForbiddenException('حساب المالك لا يمكن تفعيله عبر هذه الطريقة');
    if (!this.canMutate(actor, target)) throw new ForbiddenException('هذا المستخدم غير مصرح له');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: { ...SAFE },
    });
    await this.prisma.auditLog.create({
      data: { action: 'user.activate', entity: 'User', entityId: id, details: `activated by ${actor.username}`, userId: actor.id },
    });
    return updated;
  }

  async remove(id: string, actor: ReqUser) {
    const target = await this.target(id);
    if (target.isOwner) throw new ForbiddenException('حساب المالك لا يمكن حذفه');
    if (actor.id === id) throw new ForbiddenException('لا يمكنك حذف حسابك');
    if (!this.canMutate(actor, target)) throw new ForbiddenException('هذا المستخدم غير مصرح له');
    // Disable-without-delete preserves history (spec: disable support).
    const updated = await this.prisma.user.update({ where: { id }, data: { isActive: false }, select: { ...SAFE } });
    await this.prisma.auditLog.create({ data: { action: 'user.delete', entity: 'User', entityId: id, details: `disabled by ${actor.username}`, userId: actor.id } });
    return updated;
  }
}
