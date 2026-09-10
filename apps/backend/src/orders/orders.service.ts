import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateOrderDto } from './dto';
import { Decimal } from '@prisma/client/runtime/library';
import { DiscountsService } from '../discounts/discounts.service';
import { SettingsService, StoreClosedException } from '../settings/settings.service';
import { AlertsService } from '../alerts/alerts.service';
import * as crypto from 'crypto';

const ORDER_INCLUDE = {
  customer: true,
  createdBy: { select: { username: true, fullName: true } },
  deliveryRep: { select: { username: true, fullName: true } },
  items: { include: { product: true } },
} as const;

function newPublicToken(): string {
  return crypto.randomBytes(12).toString('hex'); // non-sequential, 24 hex chars
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private discounts: DiscountsService,
    private settings: SettingsService,
    private alerts: AlertsService,
  ) {}

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

  list(params: { status?: string; tab?: string; orderType?: string; search?: string; repId?: string; customer?: string; orderNumber?: string; take?: number; skip?: number }) {
    const { status, tab, orderType, search, repId, customer, orderNumber, take = 100, skip = 0 } = params;
    let statuses: any[] | undefined;
    if (tab === 'pending') statuses = ['PENDING', 'HELD'];
    else if (tab === 'log' || tab === 'completed') statuses = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'RETURNED'];
    if (status && status !== 'ALL') statuses = [status];
    const refundRequested = tab === 'approvals' || tab === 'returns-pending';
    const orderNo = Number(orderNumber);
    return this.prisma.order.findMany({
      where: {
        ...(statuses && !refundRequested ? { status: { in: statuses } } : {}),
        ...(refundRequested ? { refundRequestedAt: { not: null } } : {}),
        ...(orderType && orderType !== 'ALL' ? { orderType: orderType as any } : {}),
        ...(repId ? { deliveryRepId: repId } : {}),
        ...(customer ? { customer: { name: { contains: customer } } } : {}),
        ...(orderNumber && Number.isFinite(orderNo) ? { orderNumber: { equals: orderNo } } : {}),
        ...(search ? { OR: [{ notes: { contains: search } }, { customer: { name: { contains: search } } }, { orderNumber: { equals: Number(search) || -1 } }] } : {}),
      },
      include: ORDER_INCLUDE,
      orderBy: refundRequested ? { refundRequestedAt: 'desc' } : { createdAt: 'desc' },
      take: Math.min(Number(take) || 100, 500), skip: Number(skip) || 0,
    });
  }

  async byId(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    return order;
  }

  /** Public (no-login) order lookup by non-sequential token — §1 QR receipt link. */
  async byPublicToken(token: string) {
    const order = await this.prisma.order.findUnique({
      where: { publicToken: token },
      include: { items: true, customer: { select: { name: true } } },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    return order;
  }

  /**
   * §2 — apply a discount code to order totals. Pure arithmetic; returns the
   * new discount + total. Codes are consumed only at confirmation.
   */
  private async applyDiscountCodeIfAny(dto: CreateOrderDto, subtotal: Decimal) {
    let discount = new Decimal(dto.discount ?? 0);
    let discountCode: string | null = null;
    if (dto.discountCode) {
      const { amount } = await this.discounts.validateForConfirm(dto.discountCode, Number(subtotal));
      discount = new Decimal(amount);
      discountCode = dto.discountCode.trim().toUpperCase();
    }
    // A frontend-sent discount is never allowed to exceed the subtotal.
    if (discount.greaterThan(subtotal)) discount = subtotal;
    return { discount, discountCode };
  }

  /**
   * Core transactional order creation.
   * - Prices ALWAYS loaded from DB (frontend unitPrice ignored).
   * - Stock validated; insufficient → 409 with Arabic message.
   * - HELD/PENDING: persisted without deducting stock; discount code NOT
   *   consumed (consumed on the later /confirm).
   * - CONFIRMED/COMPLETED: deduct stock + SALE movements atomically and
   *   consume the discount code usage.
   * - §6: external channel intake (header X-Channel: external) is rejected
   *   while store_accepting_orders is off. In-store POS never sets it.
   */
  async create(dto: CreateOrderDto, userId: string, req?: { headers?: Record<string, any> }) {
    if (!dto.items?.length) throw new BadRequestException('حدث خطأ أثناء حفظ الطلب — لا توجد أصناف');
    // Offline-first idempotency (§5d): the Electron outbox sends a stable
    // `Idempotency-Key` per queued order. Replays return the SAME order;
    // failures release the claim so the client can retry with the same key.
    // Requests without a key behave exactly as before.
    const key = String(req?.headers?.['idempotency-key'] || req?.headers?.['Idempotency-Key'] || '').trim() || null;
    if (key) {
      const replay = await this.claimOrReplay(key, userId);
      if (replay) return replay;
    }
    // §6 enforcement point — only external/online intake reaches here with the header.
    if (String(req?.headers?.['x-channel'] || '') === 'external') {
      await this.settings.assertExternalOrdersAllowed();
    }
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

      // §2 discount code validation + amount (validated inside the tx against
      // the authoritative subtotal; consumption happens for confirmed orders).
      const { discount, discountCode } = await this.applyDiscountCodeIfAny(dto, subtotal);
      const total = subtotal.minus(discount);

      const order = await tx.order.create({
        data: {
          orderType: (dto.orderType as any) || 'PICKUP',
          status: status as any,
          customerId: dto.customerId || null,
          createdById: userId,
          deliveryRepId: dto.deliveryRepId || null,
          totalItems: lines.length,
          totalQuantity: totalQty,
          subtotal, discount, tax: new Decimal(0), total,
          paymentMethod: dto.paymentMethod || 'CASH',
          notes: dto.notes,
          discountCode,
          publicToken: newPublicToken(),
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

      // Consume discount usage only when money actually moves (confirmed).
      if (deductStock && discountCode) {
        await this.discounts.consume(discountCode);
      }

      await tx.auditLog.create({ data: { action: status === 'HELD' || status === 'PENDING' ? 'order.hold' : 'order.confirm', entity: 'Order', entityId: order.id, userId } });
      return tx.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
    }).then(async (order) => {
      if (key && order?.id) {
        await this.prisma.idempotencyKey.update({ where: { key }, data: { statusCode: 201, orderId: order.id } }).catch(() => {});
      }
      return order;
    }).catch(async (e) => {
      // Release the claim so a retry with the same key starts a fresh attempt.
      if (key) await this.prisma.idempotencyKey.delete({ where: { key } }).catch(() => {});
      if (e instanceof StoreClosedException) throw new BadRequestException('المحل مغلق مؤقتًا');
      throw e;
    });
  }

  /** Returns the replayed order when this key already completed, null when the
   * caller now owns a fresh claim. Throws 409 while another attempt is in flight. */
  private async claimOrReplay(key: string, userId: string) {
    try {
      await this.prisma.idempotencyKey.create({ data: { key, userId } });
      return null;
    } catch {
      const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
      if (existing?.statusCode === 201 && existing.orderId) {
        return this.prisma.order.findUnique({ where: { id: existing.orderId }, include: ORDER_INCLUDE });
      }
      throw new ConflictException('الطلب قيد التنفيذ — أعد المحاولة بعد قليل');
    }
  }

  /** Hold an open order (PENDING → HELD). Already-held/confirmed orders are returned as-is. */
  async holdOrder(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.status !== 'PENDING') return order;
    const updated = await this.prisma.order.update({ where: { id }, data: { status: 'HELD' } });
    await this.prisma.auditLog.create({ data: { action: 'order.hold', entity: 'Order', entityId: id, userId } });
    return updated;
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
        // Cash left the drawer (only when the order had actually been confirmed).
        const updated = await tx.order.update({
          where: { id },
          data: deducted ? { status: 'CANCELLED', refundedAt: new Date(), refundedById: userId } : { status: 'CANCELLED' },
        });
        await tx.auditLog.create({ data: { action: 'order.cancel', entity: 'Order', entityId: id, userId } });
        return updated;
      });
    }

    if (status === 'CONFIRMED' || status === 'COMPLETED') {
      // Confirm a HELD/PENDING order → validate + deduct now; if a discount
      // code was attached at hold time, validate + consume it here.
      if (order.status === 'CONFIRMED' || order.status === 'COMPLETED') return order;
      return this.prisma.$transaction(async (tx) => {
        let discount = new Decimal(order.discount as any);
        if (order.discountCode) {
          const { amount } = await this.discounts.validateForConfirm(order.discountCode, Number(order.subtotal));
          discount = new Decimal(amount);
          await this.discounts.consume(order.discountCode);
        }
        for (const item of order.items) {
          await this.deductLine(tx, item.productId, new Decimal(item.quantity as any), id, userId);
        }
        const updated = await tx.order.update({ where: { id }, data: { status, closedAt: new Date(), discount, total: new Decimal(order.subtotal as any).minus(discount) } });
        await tx.auditLog.create({ data: { action: 'order.confirm', entity: 'Order', entityId: id, userId } });
        return updated;
      });
    }
    throw new BadRequestException('حالة غير صالحة');
  }

  /** True when the order is open and awaiting manager/owner return approval. */
  private hasPendingReturnRequest(order: any): boolean {
    return !!order.refundRequestedAt && (order.status === 'CONFIRMED' || order.status === 'COMPLETED');
  }

  /**
   * §1/§7 — customer returns. Cashier asks to return; if the order total is at
   * or above the configurable approval threshold AND the requester is not a
   * manager/owner, the return becomes "pending approval" (stock untouched)
   * instead of executing immediately.
   */
  async requestReturn(id: string, user: { id: string; username: string; fullName: string; permissionLevel: number }, items?: Array<{ orderItemId: string; quantity: number }>) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true, createdBy: { select: { username: true, fullName: true } } } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.status === 'RETURNED') throw new ConflictException('الطلب مرتجع بالفعل');
    if (order.status === 'CANCELLED') throw new ConflictException('الطلب ملغي بالفعل');
    if (!(order.status === 'CONFIRMED' || order.status === 'COMPLETED')) {
      throw new BadRequestException('لا يمكن إرجاع طلب غير مؤكد');
    }
    if (this.hasPendingReturnRequest(order)) throw new ConflictException('طلب المرتجع بانتظار الموافقة بالفعل');
    const selection = this.validateReturnSelection(order, items);

    const threshold = await this.settings.getNumber('return_approval_threshold', 500);
    const total = Number(order.total);
    // Partial returns below the threshold execute immediately for everyone;
    // full-order returns at/above threshold need a manager when asked by staff.
    const needsApproval = !selection && total >= threshold && user.permissionLevel < 50;

    // Immediate return (below threshold or manager/owner): restore stock now.
    if (!needsApproval) return this.finalizeReturn(id, user.id, selection);

    // Pending approval: cashier records intent, nothing moves yet.
    const now = new Date();
    const pending = await this.prisma.order.update({
      where: { id },
      data: { refundRequestedAt: now, refundRequestedById: user.id },
    });
    await this.prisma.auditLog.create({
      data: {
        action: 'order.return.requested', entity: 'Order', entityId: id, userId: user.id,
        details: JSON.stringify({ amount: total, threshold }),
      },
    });
    const cashier = order.createdBy?.fullName || order.createdBy?.username || user.fullName || '—';
    await this.alerts.pendingReturnApproval({ orderId: id, orderNumber: Number(order.orderNumber), amount: total, cashier });
    return { ...pending, pendingApproval: true, approvalRequired: true, threshold };
  }

  /** Approve a pending return (manager/owner) → stock restored + cash refunded. */
  async approveReturn(id: string, user: { id: string; permissionLevel: number }) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (!this.hasPendingReturnRequest(order)) throw new ConflictException('لا يوجد طلب مرتجع معلق لهذا الطلب');
    const done = await this.finalizeReturn(id, user.id);
    await this.prisma.auditLog.create({ data: { action: 'order.return.approved', entity: 'Order', entityId: id, userId: user.id } });
    return done;
  }

  /** Reject a pending return request → back to a plain confirmed order. */
  async rejectReturn(id: string, user: { id: string }) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (!this.hasPendingReturnRequest(order)) throw new ConflictException('لا يوجد طلب مرتجع معلق لهذا الطلب');
    const updated = await this.prisma.order.update({ where: { id }, data: { refundRequestedAt: null, refundRequestedById: null } });
    await this.prisma.auditLog.create({ data: { action: 'order.return.rejected', entity: 'Order', entityId: id, userId: user.id } });
    return updated;
  }

  /** Validate an optional partial-return selection; returns normalized lines or null for full return. */
  private validateReturnSelection(order: any, items?: Array<{ orderItemId: string; quantity: number }>) {
    if (!items?.length) return null;
    const byId = new Map<string, any>((order.items || []).map((i: any) => [i.id, i]));
    const selection = items.map((s) => {
      const line = byId.get(s.orderItemId);
      if (!line) throw new NotFoundException('بند الطلب غير موجود');
      const qty = new Decimal(s.quantity);
      if (!(qty.greaterThan(0))) throw new BadRequestException('كمية المرتجع غير صالحة');
      if (qty.greaterThan(new Decimal(line.quantity as any))) throw new BadRequestException('كمية المرتجع تتجاوز كمية البند');
      return { line, qty };
    });
    if (!selection.length) throw new BadRequestException('اختر بندًا واحدًا على الأقل للمرتجع');
    return selection;
  }

  /** Shared execution path: restore stock, stamp RETURNED + refundedAt. */
  private async finalizeReturn(id: string, userId: string, selection?: Array<{ line: any; qty: Decimal }> | null) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    return this.prisma.$transaction(async (tx) => {
      if (!selection?.length) {
        for (const item of order.items) {
          await this.restoreLine(tx, item.productId, new Decimal(item.quantity as any), id, userId, 'ORDER_RETURN');
        }
        const now = new Date();
        const updated = await tx.order.update({
          where: { id },
          data: { status: 'RETURNED', refundedAt: now, refundedById: userId, refundRequestedAt: null, refundRequestedById: null },
        });
        await tx.auditLog.create({ data: { action: 'order.return', entity: 'Order', entityId: id, userId, details: JSON.stringify({ refundedAt: now.toISOString() }) } });
        return tx.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
      }
      // Partial return: restore only selected quantities; the order stays
      // confirmed (drawer math is full-order based) with the refund in audit.
      let refundAmount = new Decimal(0);
      for (const s of selection) {
        await this.restoreLine(tx, s.line.productId, s.qty, id, userId, 'ORDER_RETURN');
        refundAmount = refundAmount.plus(new Decimal(s.line.lineTotal as any).div(new Decimal(s.line.quantity as any)).mul(s.qty));
      }
      // Shrink the returned lines; drop lines fully returned.
      for (const s of selection) {
        const remaining = new Decimal(s.line.quantity as any).minus(s.qty);
        if (remaining.greaterThan(0)) {
          const unit = new Decimal(s.line.lineTotal as any).div(new Decimal(s.line.quantity as any));
          await tx.orderItem.update({ where: { id: s.line.id }, data: { quantity: remaining, lineTotal: unit.mul(remaining) } });
        } else {
          await tx.orderItem.delete({ where: { id: s.line.id } });
        }
      }
      const now = new Date();
      await tx.auditLog.create({ data: { action: 'order.return.partial', entity: 'Order', entityId: id, userId, details: JSON.stringify({ refundAmount: refundAmount.toString(), refundedAt: now.toISOString() }) } });
      return tx.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    });
  }

  /** §1 — store a 1–5 star rating left from the public QR order page. */
  async rateOrder(id: string, rating: number, note: string) {
    return this.prisma.order.update({
      where: { id },
      data: { rating, ratingNote: note || null },
    });
  }
}
