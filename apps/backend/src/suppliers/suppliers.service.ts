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
  async create(dto: UpsertSupplierDto, userId?: string) {
    const row = await this.prisma.supplier.create({ data: { ...dto, active: dto.active ?? true } });
    await this.prisma.auditLog.create({ data: { action: 'supplier.create', entity: 'Supplier', entityId: row.id, details: row.name, userId } });
    return row;
  }
  async update(id: string, dto: UpsertSupplierDto, userId?: string) {
    await this.byId(id);
    const row = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.prisma.auditLog.create({ data: { action: 'supplier.update', entity: 'Supplier', entityId: id, userId } });
    return row;
  }
  async remove(id: string, userId?: string) {
    const used = await this.prisma.purchaseOrder.count({ where: { supplierId: id } });
    if (used > 0) throw new ConflictException('لا يمكن حذف مورد مرتبط بمشتريات');
    const row = await this.byId(id);
    const deleted = await this.prisma.supplier.delete({ where: { id } });
    await this.prisma.auditLog.create({ data: { action: 'supplier.delete', entity: 'Supplier', entityId: id, details: row.name, userId } });
    return deleted;
  }
}
