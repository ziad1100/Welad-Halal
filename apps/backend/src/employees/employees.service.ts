import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { UpsertEmployeeDto } from './dto';
import { ROLE_LEVEL, type RoleName } from '../common/level.decorator';
import type { ReqUser } from '../common/current-user';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}
  list() {
    return this.prisma.employee.findMany({ include: { user: { select: { id: true, fullName: true, username: true, role: true, permissionLevel: true, isActive: true } } }, orderBy: { createdAt: 'desc' } });
  }
  async create(dto: UpsertEmployeeDto, actor: ReqUser) {
    const role = ((dto.role as RoleName) || 'employee') as RoleName;
    if (role !== 'manager' && role !== 'employee') throw new ForbiddenException('لا يمكن إنشاء هذا النوع من الحسابات');
    if (ROLE_LEVEL[role] > actor.permissionLevel) throw new ForbiddenException('لا يمكنك منح صلاحية أعلى من صلاحيتك');
    if (dto.userId) {
      const u = await this.prisma.user.findUnique({ where: { id: dto.userId } });
      if (!u) throw new NotFoundException('المستخدم غير موجود');
      const ex = await this.prisma.employee.findUnique({ where: { userId: dto.userId } });
      if (ex) throw new ConflictException('هذا المستخدم مسجل كموظف بالفعل');
      const emp = await this.prisma.employee.create({ data: { userId: dto.userId, phone: dto.phone, address: dto.address, salary: new Decimal(dto.salary ?? 0), hireDate: dto.hireDate ? new Date(dto.hireDate) : null } });
      await this.prisma.auditLog.create({ data: { action: 'user.create', entity: 'Employee', entityId: emp.id, userId: actor.id } });
      return emp;
    }
    if (!dto.name || !dto.username || !dto.password) throw new BadRequestException('الاسم واسم المستخدم وكلمة المرور مطلوبة');
    const dup = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (dup) throw new ConflictException('اسم المستخدم مستخدم بالفعل');
    const user = await this.prisma.user.create({ data: { fullName: dto.name, username: dto.username, passwordHash: await bcrypt.hash(dto.password, 10), role, permissionLevel: ROLE_LEVEL[role], createdByUserId: actor.id } });
    const emp = await this.prisma.employee.create({ data: { userId: user.id, phone: dto.phone, address: dto.address, salary: new Decimal(dto.salary ?? 0), hireDate: dto.hireDate ? new Date(dto.hireDate) : null } });
    await this.prisma.auditLog.create({ data: { action: 'user.create', entity: 'Employee', entityId: emp.id, userId: actor.id } });
    return emp;
  }
  async update(id: string, dto: UpsertEmployeeDto, actor: ReqUser) {
    const emp = await this.prisma.employee.findUnique({ where: { id }, include: { user: true } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    if (dto.role !== undefined) {
      if (ROLE_LEVEL[dto.role as RoleName] > actor.permissionLevel) throw new ForbiddenException('لا يمكنك منح صلاحية أعلى من صلاحيتك');
      if (emp.user.isOwner) throw new ForbiddenException('حساب المالك لا يمكن تعديله');
      await this.prisma.user.update({ where: { id: emp.userId }, data: { role: dto.role as any, permissionLevel: ROLE_LEVEL[dto.role as RoleName] } });
    }
    const updated = await this.prisma.employee.update({ where: { id }, data: { phone: dto.phone, address: dto.address, salary: dto.salary !== undefined ? new Decimal(dto.salary) : undefined, hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined, active: dto.active } });
    await this.prisma.auditLog.create({ data: { action: 'user.update', entity: 'Employee', entityId: id, userId: actor.id } });
    return updated;
  }
}
