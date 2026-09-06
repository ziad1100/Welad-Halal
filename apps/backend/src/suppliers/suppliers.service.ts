import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpsertSupplierDto } from './dto';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}
  list(search?: string) {
    return this.prisma.supplier.findMany({
      where: search ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] } : {},
      include: { _count: { select: { purchases: true, products: true } } },
      orderBy: { name: 'asc' }, take: 200,
    });
  }
  async byId(id: string) {
    const s = await this.prisma.supplier.findUnique({ where: { id }, include: { purchases: { orderBy: { createdAt: 'desc' }, take: 20 }, products: { take: 50 } } });
    if (!s) throw new NotFoundException('المورد غير موجود');
    return s;
  }
  create(dto: UpsertSupplierDto) { return this.prisma.supplier.create({ data: { ...dto, active: dto.active ?? true } }); }
  async update(id: string, dto: UpsertSupplierDto) {
    await this.byId(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }
  async remove(id: string) {
    const used = await this.prisma.purchaseOrder.count({ where: { supplierId: id } });
    if (used > 0) throw new ConflictException('لا يمكن حذف مورد مرتبط بمشتريات');
    await this.byId(id);
    return this.prisma.supplier.delete({ where: { id } });
  }
}
