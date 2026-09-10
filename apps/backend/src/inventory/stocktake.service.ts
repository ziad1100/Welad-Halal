import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../common/cache.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class StockTakeService {
  constructor(private prisma: PrismaService, private cache: CacheService) {}

  list() {
    return this.prisma.stockTake.findMany({
      include: { createdBy: { select: { username: true, fullName: true } }, _count: { select: { lines: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  /** Open a session: snapshot live quantities of all active stock products. */
  async open(name: string, userId: string) {
    const products = await this.prisma.product.findMany({
      where: { active: true, productType: 'INVENTORY_ITEM' },
      include: { inventory: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const take = await tx.stockTake.create({ data: { name, createdById: userId } });
      await tx.stockTakeLine.createMany({
        data: products.map((p) => ({ takeId: take.id, productId: p.id, systemQty: new Decimal((p.inventory?.quantity as any) ?? 0) })),
      });
      await tx.auditLog.create({ data: { action: 'stocktake.open', entity: 'StockTake', entityId: take.id, details: name, userId } });
      return take;
    });
  }

  async detail(id: string) {
    const take = await this.prisma.stockTake.findUnique({
      where: { id },
      include: { lines: { include: { product: { include: { inventory: true } } }, orderBy: { product: { name: 'asc' } } }, createdBy: { select: { username: true } } },
    });
    if (!take) throw new NotFoundException('الجرد غير موجود');
    const lines = take.lines.map((l) => {
      const live = new Decimal((l.product.inventory?.quantity as any) ?? 0);
      const drift = live.minus(new Decimal(l.systemQty as any)); // sales during an OPEN session
      const counted = l.countedQty === null ? null : new Decimal(l.countedQty as any);
      const diff = counted === null ? null : counted.minus(live);
      return { ...l, liveQty: live.toString(), drift: drift.toString(), diff: diff?.toString() ?? null };
    });
    const counted = lines.filter((l) => l.countedQty !== null);
    const shortages = counted.filter((l) => Number(l.diff) < 0);
    const overages = counted.filter((l) => Number(l.diff) > 0);
    return { ...take, lines, summary: { total: lines.length, counted: counted.length, shortages: shortages.length, overages: overages.length } };
  }

  async count(id: string, lines: { productId: string; countedQty: number }[]) {
    const take = await this.prisma.stockTake.findUnique({ where: { id } });
    if (!take) throw new NotFoundException('الجرد غير موجود');
    if (take.status !== 'OPEN') throw new ConflictException('لا يمكن التعديل على جرد مغلق');
    return this.prisma.$transaction(
      lines.map((l) =>
        this.prisma.stockTakeLine.update({ where: { takeId_productId: { takeId: id, productId: l.productId } }, data: { countedQty: new Decimal(l.countedQty) } }),
      ),
    );
  }

  /**
   * Commit: diffs computed against LIVE quantity (drift-flagged, never silent).
   * Only counted lines are applied; uncounted lines are skipped.
   */
  async commit(id: string, userId: string) {
    const take = await this.prisma.stockTake.findUnique({ where: { id }, include: { lines: true } });
    if (!take) throw new NotFoundException('الجرد غير موجود');
    if (take.status !== 'OPEN') throw new ConflictException('الجرد مغلق بالفعل');
    const counted = take.lines.filter((l) => l.countedQty !== null);
    if (!counted.length) throw new BadRequestException('لا توجد أصناف معدودة — سجل العد أولاً');
    return this.prisma.$transaction(async (tx) => {
      let applied = 0;
      for (const l of counted) {
        const inv = await tx.inventory.findUnique({ where: { productId: l.productId } });
        const live = new Decimal((inv?.quantity as any) ?? 0);
        const diff = new Decimal(l.countedQty as any).minus(live);
        if (!diff.isZero()) {
          await tx.inventory.update({ where: { productId: l.productId }, data: { quantity: new Decimal(l.countedQty as any) } });
          await tx.stockMovement.create({ data: { productId: l.productId, type: 'STOCKTAKE', quantity: diff, referenceType: 'STOCKTAKE', referenceId: id, notes: `جرد: ${take.name}`, createdById: userId } });
          applied++;
        }
      }
      await tx.stockTake.update({ where: { id }, data: { status: 'COMMITTED', committedAt: new Date() } });
      await tx.auditLog.create({ data: { action: 'stocktake.commit', entity: 'StockTake', entityId: id, details: `${take.name}: applied=${applied}/${counted.length}`, userId } });
      return { applied, counted: counted.length };
    }).then(async (result) => {
      // Invalidate cache for all products that were stock-taken
      for (const l of counted) {
        const p = await this.prisma.product.findUnique({ where: { id: l.productId }, select: { barcode: true } });
        await this.cache.invalidateProduct(l.productId, p?.barcode);
      }
      return result;
    });
  }

  async cancel(id: string, userId: string) {
    const take = await this.prisma.stockTake.findUnique({ where: { id } });
    if (!take) throw new NotFoundException('الجرد غير موجود');
    if (take.status !== 'OPEN') throw new ConflictException('الجرد مغلق بالفعل');
    const updated = await this.prisma.stockTake.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.prisma.auditLog.create({ data: { action: 'stocktake.commit', entity: 'StockTake', entityId: id, details: 'cancelled', userId } });
    return updated;
  }

  // ── Batches / expiry ──

  async addBatch(dto: { productId: string; batchNo?: string; expiryDate?: string; quantity: number }, userId: string) {
    const p = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!p) throw new NotFoundException('المنتج غير موجود');
    const batch = await this.prisma.inventoryBatch.create({
      data: { productId: dto.productId, batchNo: dto.batchNo, expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null, quantity: new Decimal(dto.quantity) },
    });
    await this.prisma.auditLog.create({ data: { action: 'inventory.adjust', entity: 'InventoryBatch', entityId: batch.id, details: `exp=${dto.expiryDate || '-'}`, userId } });
    await this.cache.invalidateProduct(dto.productId, p.barcode);
    return batch;
  }

  batches(productId?: string) {
    return this.prisma.inventoryBatch.findMany({
      where: productId ? { productId } : {},
      include: { product: { select: { name: true, nameAr: true, barcode: true } } },
      orderBy: { expiryDate: 'asc' }, take: 300,
    });
  }

  /** FEFO-ordered batches expiring within `days` (default 7). */
  async expiring(days = 7) {
    const limit = new Date(Date.now() + Number(days) * 86400000);
    const rows = await this.prisma.inventoryBatch.findMany({
      where: { expiryDate: { lte: limit }, quantity: { gt: 0 } },
      include: { product: { select: { name: true, nameAr: true, barcode: true } } },
      orderBy: { expiryDate: 'asc' }, take: 200,
    });
    const now = Date.now();
    return rows.map((r) => ({ ...r, daysLeft: Math.ceil((new Date(r.expiryDate as any).getTime() - now) / 86400000) }));
  }
}
