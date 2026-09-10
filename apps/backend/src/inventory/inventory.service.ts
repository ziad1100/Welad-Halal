import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../common/cache.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService, private cache: CacheService) {}
  list(lowOnly = false) {
    return this.prisma.inventory.findMany({ include: { product: { include: { category: true } } }, orderBy: { updatedAt: 'desc' } })
      .then(rows => lowOnly ? rows.filter(r => Number(r.quantity) <= Number(r.minimumQuantity)) : rows);
  }
  movements(productId?: string) {
    return this.prisma.stockMovement.findMany({ where: productId ? { productId } : {}, include: { product: true }, orderBy: { createdAt: 'desc' }, take: 300 });
  }
  async adjust(productId: string, quantity: number, userId: string, notes?: string) {
    const inv = await this.prisma.inventory.findUnique({ where: { productId } });
    if (!inv) throw new NotFoundException('المنتج غير موجود');
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.inventory.update({ where: { productId }, data: { quantity: new Decimal(Number(inv.quantity) + quantity) } });
      await tx.stockMovement.create({ data: { productId, type: 'ADJUSTMENT', quantity: new Decimal(quantity), notes, createdById: userId } });
      await tx.auditLog.create({ data: { action: 'inventory.adjust', entity: 'Product', entityId: productId, details: `+${quantity}`, userId } });
      return updated;
    });
    const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { barcode: true } });
    await this.cache.invalidateProduct(productId, p?.barcode);
    return result;
  }
  async setStock(productId: string, quantity: number, userId: string, notes?: string) {
    const inv = await this.prisma.inventory.findUnique({ where: { productId } });
    if (!inv) throw new NotFoundException('المنتج غير موجود');
    const diff = quantity - Number(inv.quantity);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.inventory.update({ where: { productId }, data: { quantity: new Decimal(quantity) } });
      await tx.stockMovement.create({ data: { productId, type: 'ADJUSTMENT', quantity: new Decimal(diff), notes: notes || 'تسوية مخزون', createdById: userId } });
      await tx.auditLog.create({ data: { action: 'inventory.adjust', entity: 'Product', entityId: productId, details: `set=${quantity}`, userId } });
      return updated;
    });
    const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { barcode: true } });
    await this.cache.invalidateProduct(productId, p?.barcode);
    return result;
  }
}
