import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateOrderDto } from './dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  /** Deduct stock for one order line: direct item or bundle decomposition (components). */
  private async deductLine(tx: any, productId: string, qty: Decimal, refId: string, userId: string, refType = 'ORDER') {
    const prod = await tx.product.findUnique({ where: { id: productId }, include: { inventory: true, components: true } });
    if (!prod) throw new NotFoundException('المنتج غير موجود');
    if (prod.productType === 'INVENTORY_ITEM') {
      const available = new Decimal((prod.inventory?.quantity as any) ?? 0);
      if (available.lessThan(qty)) throw new ConflictException('الكمية غير متاحة في المخزن');
      await tx.inventory.update({ where: { productId }, data: { quantity: { decrement: qty } } });
      await tx.stockMovement.create({ data: { productId, type: 'SALE', quantity: qty, referenceType: refType, referenceId: refId, createdById: userId } });
    } else if (prod.productType === 'BUNDLED_ITEM') {
      if (!prod.components?.length) throw new ConflictException(`الصنف المجمع غير مكتمل: ${prod.nameAr || prod.name}`);
      for (const c of prod.components) {
        const need = new Decimal(c.quantity as any).mul(qty);
        const inv = await tx.inventory.findUnique({ where: { productId: c.componentId } });
        if (!inv || new Decimal(inv.quantity as any).lessThan(need)) throw new ConflictException('الكمية غير متاحة في المخزن');
      }
      for (const c of prod.components) {
        const need = new Decimal(c.quantity as any).mul(qty);
        await tx.inventory.update({ where: { productId: c.componentId }, data: { quantity: { decrement: need } } });
        await tx.stockMovement.create({ data: { productId: c.componentId, type: 'SALE', quantity: need, referenceType: refType, referenceId: refId, notes: `مكون: ${prod.nameAr || prod.name}`, createdById: userId } });
      }
    }
    // SERVICE_ITEM / RAW_MATERIAL: no stock movement
  }

  private async restoreLine(tx: any, productId: string, qty: Decimal, refId: string, userId: string, refType: string) {
    const prod = await tx.product.findUnique({ where: { id: productId }, include: { components: true } });
    if (prod?.productType === 'INVENTORY_ITEM') {
      await tx.inventory.update({ where: { productId }, data: { quantity: { increment: qty } } });
      await tx.stockMovement.create({ data: { productId, type: 'RETURN', quantity: qty, referenceType: refType, referenceId: refId, createdById: userId } });
    } else if (prod?.productType === 'BUNDLED_ITEM') {
      for (const c of prod.components || []) {
        const back = new Decimal((c.quantity as any)).mul(qty);
        await tx.inventory.update({ where: { productId: c.componentId }, data: { quantity: { increment: back } } });
        await tx.stockMovement.create({ data: { productId: c.componentId, type: 'RETURN', quantity: back, referenceType: refType, referenceId: refId, createdById: userId } });
      }
    }
  }

  list(params: { status?: string; tab?: string; orderType?: string; search?: string; take?: number; skip?: number }) {
    const { status, tab, orderType, search, take = 100, skip = 0 } = params;
    let statuses: any[] | undefined;
    if (tab === 'pending') statuses = ['PENDING', 'HELD'];
    else if (tab === 'log' || tab === 'completed') statuses = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'RETURNED'];
    if (status && status !== 'ALL') statuses = [status];
    return this.prisma.order.findMany({
      where: {
        ...(statuses ? { status: { in: statuses } } : {}),
        ...(orderType && orderType !== 'ALL' ? { orderType: orderType as any } : {}),
        ...(search ? { OR: [{ notes: { contains: search } }, { customer: { name: { contains: search } } }] } : {}),
      },
      include: { customer: true, createdBy: { select: { username: true, name: true } }, deliveryRep: { select: { username: true, name: true } }, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 100, 500), skip: Number(skip) || 0,
    });
  }

  async byId(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { customer: true, createdBy: { select: { username: true, name: true } }, deliveryRep: { select: { username: true, name: true } }, items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    return order;
  }

  /**
   * Core transactional order creation.
   * - Prices ALWAYS loaded from DB (frontend unitPrice ignored).
   * - Stock validated; insufficient → 409 with Arabic message.
   * - HELD/PENDING: persisted without deducting stock.
   * - CONFIRMED/COMPLETED: deduct stock + SALE movements atomically.
   */
  async create(dto: CreateOrderDto, userId: string) {
    if (!dto.items?.length) throw new BadRequestException('حدث خطأ أثناء حفظ الطلب — لا توجد أصناف');
    const status = (dto.status as any) || 'CONFIRMED';
    const deductStock = status === 'CONFIRMED' || status === 'COMPLETED';

    return this.prisma.$transaction(async (tx) => {
      // Load all products from DB (authoritative prices)
      const ids = [...new Set(dto.items.map((i) => i.productId))];
      const products = await tx.product.findMany({ where: { id: { in: ids } }, include: { inventory: true, components: true } });
      const map = new Map(products.map((p) => [p.id, p]));
      for (const line of dto.items) {
        if (!map.has(line.productId)) throw new NotFoundException('المنتج غير موجود');
        if (!(Number(line.quantity) > 0)) throw new BadRequestException('حدث خطأ أثناء حفظ الطلب — الكمية غير صالحة');
      }

      // Batch-load component inventories for bundle validation (single query)
      const compIds = [...new Set((products as any[]).filter((p) => p.productType === 'BUNDLED_ITEM').flatMap((p) => (p.components || []).map((c: any) => c.componentId as string)))];
      const compInvs = compIds.length ? await tx.inventory.findMany({ where: { productId: { in: compIds } } }) : [];
      const compInvMap = new Map(compInvs.map((i: any) => [i.productId, new Decimal(i.quantity as any)]));

      let subtotal = new Decimal(0);
      let totalQty = new Decimal(0);
      const lines = dto.items.map((line) => {
        const p = map.get(line.productId)!;
        const dbPrice = new Decimal(p.retailPrice as any); // authoritative
        const qty = new Decimal(line.quantity);
        const discount = new Decimal(line.discount ?? 0);
        const lineTotal = dbPrice.mul(qty).minus(discount);
        if (deductStock && p.productType === 'INVENTORY_ITEM') {
          const available = new Decimal((p.inventory?.quantity as any) ?? 0);
          if (available.lessThan(qty)) throw new ConflictException('الكمية غير متاحة في المخزن');
        }
        if (deductStock && (p as any).productType === 'BUNDLED_ITEM') {
          const comps: any[] = (p as any).components || [];
          if (!comps.length) throw new ConflictException(`الصنف المجمع غير مكتمل: ${(p as any).nameAr || (p as any).name}`);
          for (const c of comps) {
            const need = new Decimal(c.quantity as any).mul(qty);
            const available = compInvMap.get(c.componentId) ?? new Decimal(0);
            if (available.lessThan(need)) throw new ConflictException('الكمية غير متاحة في المخزن');
          }
        }
        subtotal = subtotal.plus(lineTotal);
        totalQty = totalQty.plus(qty);
        return { p, qty, dbPrice, discount, lineTotal };
      });

      const discountTotal = new Decimal(dto.discount ?? 0);
      const total = subtotal.minus(discountTotal);

      const order = await tx.order.create({
        data: {
          orderType: (dto.orderType as any) || 'PICKUP',
          status: status as any,
          customerId: dto.customerId || null,
          createdById: userId,
          deliveryRepId: dto.deliveryRepId || null,
          totalItems: lines.length,
          totalQuantity: totalQty,
          subtotal, discount: discountTotal, tax: new Decimal(0), total,
          notes: dto.notes,
          closedAt: deductStock ? new Date() : null,
        },
      });

      for (const l of lines) {
        await tx.orderItem.create({
          data: {
            orderId: order.id, productId: l.p.id,
            productNameSnapshot: l.p.nameAr || l.p.name,
            unitPriceSnapshot: l.dbPrice, // historical snapshot
            quantity: l.qty, discount: l.discount, tax: new Decimal(0), lineTotal: l.lineTotal,
          },
        });
        if (deductStock) {
          await this.deductLine(tx, l.p.id, l.qty, order.id, userId);
        }
      }

      await tx.auditLog.create({ data: { action: status === 'HELD' || status === 'PENDING' ? 'order.hold' : 'order.confirm', entity: 'Order', entityId: order.id, userId } });
      return this.byIdTx(tx, order.id);
    });
  }

  private byIdTx(tx: any, id: string) {
    return tx.order.findUnique({ where: { id }, include: { customer: true, createdBy: { select: { username: true, name: true } }, items: { include: { product: true } } } });
  }

  async setStatus(id: string, status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED', userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.status === 'CANCELLED') throw new ConflictException('الطلب ملغي بالفعل');

    if (status === 'CANCELLED') {
      // Restore stock only if it was deducted
      const deducted = order.status === 'CONFIRMED' || order.status === 'COMPLETED';
      return this.prisma.$transaction(async (tx) => {
        if (deducted) {
          for (const item of order.items) {
            await this.restoreLine(tx, item.productId, new Decimal(item.quantity as any), id, userId, 'ORDER_CANCEL');
          }
        }
        const updated = await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
        await tx.auditLog.create({ data: { action: 'order.cancel', entity: 'Order', entityId: id, userId } });
        return updated;
      });
    }

    if (status === 'CONFIRMED' || status === 'COMPLETED') {
      // Confirm a HELD/PENDING order → validate + deduct now
      if (order.status === 'CONFIRMED' || order.status === 'COMPLETED') return order;
      return this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          await this.deductLine(tx, item.productId, new Decimal(item.quantity as any), id, userId);
        }
        const updated = await tx.order.update({ where: { id }, data: { status, closedAt: new Date() } });
        await tx.auditLog.create({ data: { action: 'order.confirm', entity: 'Order', entityId: id, userId } });
        return updated;
      });
    }
    throw new BadRequestException('حالة غير صالحة');
  }

  async returnOrder(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.status === 'RETURNED') throw new ConflictException('الطلب مرتجع بالفعل');
    return this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await this.restoreLine(tx, item.productId, new Decimal(item.quantity as any), id, userId, 'ORDER_RETURN');
      }
      const updated = await tx.order.update({ where: { id }, data: { status: 'RETURNED' } });
      await tx.auditLog.create({ data: { action: 'order.return', entity: 'Order', entityId: id, userId } });
      return updated;
    });
  }
}
