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
  create(dto: UpsertCustomerDto) {
    const { balance, ...rest } = dto;
    return this.prisma.customer.create({ data: { ...rest, balance: balance !== undefined ? new Decimal(balance) : undefined, active: dto.active ?? true } });
  }
  async update(id: string, dto: UpsertCustomerDto) {
    await this.byId(id);
    const { balance, ...rest } = dto;
    return this.prisma.customer.update({ where: { id }, data: { ...rest, balance: balance !== undefined ? new Decimal(balance) : undefined } });
  }
}
