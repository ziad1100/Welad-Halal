import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService) {}
  list() { return this.prisma.purchaseOrder.findMany({ include: { items: { include: { product: true } }, supplier: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  async create(dto: { supplierName: string; supplierId?: string; notes?: string; items: { productId: string; quantity: number; purchasePrice: number }[] }, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      let subtotal = new Decimal(0);
      const lines = dto.items.map((l) => {
        const lt = new Decimal(l.purchasePrice).mul(new Decimal(l.quantity));
        subtotal = subtotal.plus(lt);
        return { ...l, lineTotal: lt };
      });
      const po = await tx.purchaseOrder.create({ data: { supplierName: dto.supplierName, supplierId: dto.supplierId || null, notes: dto.notes, subtotal, total: subtotal, createdById: userId } });
      for (const l of lines) {
        await tx.purchaseItem.create({ data: { purchaseOrderId: po.id, productId: l.productId, quantity: new Decimal(l.quantity), purchasePrice: new Decimal(l.purchasePrice), lineTotal: l.lineTotal } });
        await tx.inventory.upsert({ where: { productId: l.productId }, create: { productId: l.productId, quantity: new Decimal(l.quantity) }, update: { quantity: { increment: new Decimal(l.quantity) } } });
        await tx.stockMovement.create({ data: { productId: l.productId, type: 'PURCHASE', quantity: new Decimal(l.quantity), referenceType: 'PURCHASE', referenceId: po.id, createdById: userId } });
      }
      return po;
    });
  }
}
