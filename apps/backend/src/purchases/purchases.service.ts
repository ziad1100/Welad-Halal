import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../common/cache.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService, private cache: CacheService) {}
  list() { return this.prisma.purchaseOrder.findMany({ include: { items: { include: { product: true } }, supplier: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  async create(dto: { supplierName: string; supplierId?: string; notes?: string; items: { productId: string; quantity: number; purchasePrice: number }[] }, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      let subtotal = new Decimal(0);
      const lines = dto.items.map((l) => {
        const lt = new Decimal(l.purchasePrice).mul(new Decimal(l.quantity));
        subtotal = subtotal.plus(lt);
        return { ...l, lineTotal: lt };
      });
      const po = await tx.purchaseOrder.create({ data: { supplierName: dto.supplierName, supplierId: dto.supplierId || null, notes: dto.notes, subtotal, total: subtotal, createdById: userId } });
      for (const l of lines) {
        await tx.purchaseItem.create({ data: { purchaseOrderId: po.id, productId: l.productId, quantity: new Decimal(l.quantity), purchasePrice: new Decimal(l.purchasePrice), lineTotal: l.lineTotal } });
        // Moving weighted-average cost (standard accounting):
        //   newAvg = (oldQty * oldAvg + qty * price) / (oldQty + qty)
        // oldQty comes from current stock, oldAvg from Product.purchasePrice.
        // Zero/empty stock → the incoming price becomes the average.
        // Runs inside the same transaction as the stock increment below.
        const [stock, product] = await Promise.all([
          tx.inventory.findUnique({ where: { productId: l.productId } }),
          tx.product.findUnique({ where: { id: l.productId }, select: { purchasePrice: true } }),
        ]);
        const oldQty = new Decimal(stock?.quantity ?? 0);
        const oldAvg = new Decimal(product?.purchasePrice ?? 0);
        const qty = new Decimal(l.quantity);
        const price = new Decimal(l.purchasePrice);
        const totalQty = oldQty.plus(qty);
        const newAvg = totalQty.greaterThan(0) ? oldQty.mul(oldAvg).plus(qty.mul(price)).div(totalQty) : price;
        await tx.product.update({ where: { id: l.productId }, data: { purchasePrice: newAvg } });
        await tx.inventory.upsert({ where: { productId: l.productId }, create: { productId: l.productId, quantity: new Decimal(l.quantity) }, update: { quantity: { increment: new Decimal(l.quantity) } } });
        await tx.stockMovement.create({ data: { productId: l.productId, type: 'PURCHASE', quantity: new Decimal(l.quantity), referenceType: 'PURCHASE', referenceId: po.id, createdById: userId } });
      }
      await tx.auditLog.create({ data: { action: 'purchase.create', entity: 'PurchaseOrder', entityId: po.id, details: `${dto.supplierName}: ${lines.length} lines, total=${subtotal.toString()}`, userId } });
      return po;
    });
    // Invalidate cache for all products in this purchase
    for (const item of dto.items) {
      const p = await this.prisma.product.findUnique({ where: { id: item.productId }, select: { barcode: true } });
      await this.cache.invalidateProduct(item.productId, p?.barcode);
    }
    return result;
  }
}
