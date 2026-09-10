import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { UpsertCustomerDto } from './dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}
  list(search?: string) {
    return this.prisma.customer.findMany({
      where: search ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] } : {},
      orderBy: { name: 'asc' }, take: 200,
    });
  }
  async byId(id: string) {
    const c = await this.prisma.customer.findUnique({ where: { id }, include: { orders: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!c) throw new NotFoundException('العميل غير موجود');
    return c;
  }
  async create(dto: UpsertCustomerDto, userId?: string) {
    const { balance, ...rest } = dto;
    const row = await this.prisma.customer.create({ data: { ...rest, balance: balance !== undefined ? new Decimal(balance) : undefined, active: dto.active ?? true } });
    await this.prisma.auditLog.create({ data: { action: 'customer.create', entity: 'Customer', entityId: row.id, details: row.name, userId } });
    return row;
  }
  async update(id: string, dto: UpsertCustomerDto, userId?: string) {
    await this.byId(id);
    const { balance, ...rest } = dto;
    const row = await this.prisma.customer.update({ where: { id }, data: { ...rest, balance: balance !== undefined ? new Decimal(balance) : undefined } });
    await this.prisma.auditLog.create({ data: { action: 'customer.update', entity: 'Customer', entityId: id, userId } });
    return row;
  }
}
