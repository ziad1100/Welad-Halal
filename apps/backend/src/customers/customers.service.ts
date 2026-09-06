import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
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
  create(dto: UpsertCustomerDto) { return this.prisma.customer.create({ data: { ...dto, active: dto.active ?? true } }); }
  async update(id: string, dto: UpsertCustomerDto) {
    await this.byId(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }
}
