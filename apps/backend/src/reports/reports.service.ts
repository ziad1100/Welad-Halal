import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private range(from?: string, to?: string) {
    return from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined;
  }

  async sales(from?: string, to?: string) {
    const createdAt = this.range(from, to);
    const orders = await this.prisma.order.findMany({ where: { ...(createdAt ? { createdAt } : {}), status: { in: ['CONFIRMED', 'COMPLETED'] } }, include: { items: true } });
    const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);
    const totalQty = orders.reduce((s, o) => s + Number(o.totalQuantity), 0);
    return { orders: orders.length, totalSales, totalQuantity: totalQty, from: from || null, to: to || null };
  }

  async products(from?: string, to?: string) {
    const createdAt = this.range(from, to);
    const items = await this.prisma.orderItem.findMany({ where: { order: { ...(createdAt ? { createdAt } : {}), status: { in: ['CONFIRMED', 'COMPLETED'] } } }, include: { product: true } });
    const agg = new Map<string, { productId: string; name: string; quantity: number; value: number }>();
    for (const it of items) {
      const e = agg.get(it.productId) || { productId: it.productId, name: it.productNameSnapshot, quantity: 0, value: 0 };
      e.quantity += Number(it.quantity); e.value += Number(it.lineTotal);
      agg.set(it.productId, e);
    }
    return [...agg.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 100);
  }

  async inventory() {
    const rows = await this.prisma.inventory.findMany({ include: { product: true } });
    const movements = await this.prisma.stockMovement.count();
    return { products: rows.length, lowStock: rows.filter((r) => Number(r.quantity) <= Number(r.minimumQuantity)).length, movements, rows: rows.slice(0, 200) };
  }

  async daily(date?: string) {
    const day = date ? new Date(date) : new Date();
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = new Date(day); end.setHours(23, 59, 59, 999);
    const [orders, returns, expenses] = await Promise.all([
      this.prisma.order.findMany({ where: { createdAt: { gte: start, lte: end }, status: { in: ['CONFIRMED', 'COMPLETED'] } } }),
      this.prisma.order.count({ where: { createdAt: { gte: start, lte: end }, status: 'RETURNED' } }),
      this.prisma.expense.findMany({ where: { createdAt: { gte: start, lte: end } } }),
    ]);
    const sales = orders.reduce((s, o) => s + Number(o.total), 0);
    const expTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    return { date: start.toISOString().slice(0, 10), orders: orders.length, sales, returns, expenses: expTotal, net: sales - expTotal };
  }

  /** §3/§7 — per-day sales trend for the last N days (mini-charts, mobile). */
  async trend(days = 7) {
    const n = Math.max(1, Math.min(Number(days) || 7, 90));
    const points: { date: string; sales: number; orders: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const start = new Date(day);
      const end = new Date(day); end.setHours(23, 59, 59, 999);
      const rows = await this.prisma.order.findMany({
        where: { status: { in: ['CONFIRMED', 'COMPLETED'] }, closedAt: { gte: start, lte: end } },
        select: { total: true },
      });
      points.push({
        date: start.toISOString().slice(0, 10),
        sales: Math.round(rows.reduce((s, o) => s + Number(o.total), 0) * 100) / 100,
        orders: rows.length,
      });
    }
    return points;
  }
}
