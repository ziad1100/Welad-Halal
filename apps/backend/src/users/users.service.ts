import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  list() {
    return this.prisma.user.findMany({ select: { id: true, name: true, username: true, email: true, role: true, active: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
  }
  async create(dto: CreateUserDto, actorId: string) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException('اسم المستخدم مستخدم بالفعل');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({ data: { name: dto.name, username: dto.username, email: dto.email, passwordHash, role: (dto.role as any) || 'CASHIER' } });
    await this.prisma.auditLog.create({ data: { action: 'user.create', entity: 'User', entityId: user.id, userId: actorId } });
    const { passwordHash: _p, ...safe } = user;
    return safe;
  }
  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المنتج غير موجود');
    const data: any = { name: dto.name, email: dto.email, role: dto.role, active: dto.active };
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    const updated = await this.prisma.user.update({ where: { id }, data });
    await this.prisma.auditLog.create({ data: { action: 'user.update', entity: 'User', entityId: id, userId: actorId } });
    const { passwordHash: _p, ...safe } = updated;
    return safe;
  }
}
