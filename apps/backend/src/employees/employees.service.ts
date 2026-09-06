import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { UpsertEmployeeDto } from './dto';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}
  list() {
    return this.prisma.employee.findMany({ include: { user: { select: { id: true, name: true, username: true, role: true, active: true } } }, orderBy: { createdAt: 'desc' } });
  }
  async create(dto: UpsertEmployeeDto, actorId: string) {
    if (dto.userId) {
      const u = await this.prisma.user.findUnique({ where: { id: dto.userId } });
      if (!u) throw new NotFoundException('المستخدم غير موجود');
      const ex = await this.prisma.employee.findUnique({ where: { userId: dto.userId } });
      if (ex) throw new ConflictException('هذا المستخدم مسجل كموظف بالفعل');
      const emp = await this.prisma.employee.create({ data: { userId: dto.userId, phone: dto.phone, address: dto.address, salary: new Decimal(dto.salary ?? 0), hireDate: dto.hireDate ? new Date(dto.hireDate) : null } });
      await this.prisma.auditLog.create({ data: { action: 'user.create', entity: 'Employee', entityId: emp.id, userId: actorId } });
      return emp;
    }
    if (!dto.name || !dto.username || !dto.password) throw new BadRequestException('الاسم واسم المستخدم وكلمة المرور مطلوبة');
    const dup = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (dup) throw new ConflictException('اسم المستخدم مستخدم بالفعل');
    const user = await this.prisma.user.create({ data: { name: dto.name, username: dto.username, passwordHash: await bcrypt.hash(dto.password, 10), role: (dto.role as any) || 'CASHIER' } });
    const emp = await this.prisma.employee.create({ data: { userId: user.id, phone: dto.phone, address: dto.address, salary: new Decimal(dto.salary ?? 0), hireDate: dto.hireDate ? new Date(dto.hireDate) : null } });
    await this.prisma.auditLog.create({ data: { action: 'user.create', entity: 'Employee', entityId: emp.id, userId: actorId } });
    return emp;
  }
  async update(id: string, dto: UpsertEmployeeDto, actorId: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    const updated = await this.prisma.employee.update({ where: { id }, data: { phone: dto.phone, address: dto.address, salary: dto.salary !== undefined ? new Decimal(dto.salary) : undefined, hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined, active: dto.active } });
    if (dto.role) await this.prisma.user.update({ where: { id: emp.userId }, data: { role: dto.role as any } });
    await this.prisma.auditLog.create({ data: { action: 'user.update', entity: 'Employee', entityId: id, userId: actorId } });
    return updated;
  }
}
