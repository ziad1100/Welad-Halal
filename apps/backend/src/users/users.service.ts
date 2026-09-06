import { Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { ROLE_LEVEL, type RoleName } from '../common/level.decorator';
import type { ReqUser } from '../common/current-user';

const SAFE = { id: true, fullName: true, username: true, email: true, role: true, permissionLevel: true, isOwner: true, isActive: true, forcePasswordChange: true, createdByUserId: true, createdAt: true } as const;

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

  private async target(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  /** Part 8 matrix: who may mutate whom (viewed = target, actor = requester). */
  private canMutate(actor: ReqUser, target: { id: string; role: string; isOwner: boolean }): boolean {
    if (actor.isOwner) return target.id !== actor.id ? true : true; // owner: anyone; own row handled below
    if (actor.id === target.id) return true; // self name/password only (enforced in update)
    if (actor.role === 'manager' && (target.role as string) === 'employee') return true;
    return false;
  }

  async create(dto: CreateUserDto, actor: ReqUser) {
    // Only owner/manager reach here (route level 50); owner creation is never allowed via form.
    const role = (dto.role as RoleName) || 'employee';
    if (role !== 'manager' && role !== 'employee') throw new ForbiddenException('لا يمكن إنشاء هذا النوع من الحسابات');
    // Never assign a level higher than your own (manager→manager equal is allowed).
    if (ROLE_LEVEL[role] > actor.permissionLevel) throw new ForbiddenException('لا يمكنك منح صلاحية أعلى من صلاحيتك');
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username.trim() } });
    if (exists) throw new ConflictException('اسم المستخدم مستخدم بالفعل');
    const generated = dto.generatePassword || !dto.password;
    const plain = generated ? tempPassword() : dto.password!;
    if (!generated && plain.length < 4) throw new BadRequestException('كلمة المرور قصيرة');
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName, username: dto.username.trim(), email: dto.email,
        passwordHash: await bcrypt.hash(plain, 10),
        role, permissionLevel: ROLE_LEVEL[role],
        createdByUserId: actor.id, forcePasswordChange: generated,
      },
      select: { ...SAFE },
    });
    await this.prisma.auditLog.create({ data: { action: 'user.create', entity: 'User', entityId: user.id, details: `${actor.username} -> ${role}`, userId: actor.id } });
    return generated ? { ...user, temporaryPassword: plain } : user;
  }

  async update(id: string, dto: UpdateUserDto, actor: ReqUser) {
    const target = await this.target(id);
    // Owner row: immutable to everyone except the owner themself (name/password only).
    if (target.isOwner && actor.id !== target.id) throw new ForbiddenException('حساب المالك لا يمكن تعديله');
    if (actor.id === target.id) {
      if (dto.role !== undefined || (dto as any).permissionLevel !== undefined) throw new ForbiddenException('لا يمكنك تغيير دورك بنفسك');
      if (target.isOwner && dto.isActive === false) throw new ForbiddenException('لا يمكن تعطيل حساب المالك');
      const updated = await this.prisma.user.update({
        where: { id },
        data: { fullName: dto.fullName ?? undefined, email: dto.email ?? undefined, passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined },
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
        fullName: dto.fullName ?? undefined, email: dto.email ?? undefined,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
        ...(dto.role !== undefined ? { role: dto.role, permissionLevel: ROLE_LEVEL[dto.role] } : {}),
        isActive: dto.isActive ?? undefined,
      },
      select: { ...SAFE },
    });
    await this.prisma.auditLog.create({ data: { action: 'user.update', entity: 'User', entityId: id, details: `by ${actor.username}`, userId: actor.id } });
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
