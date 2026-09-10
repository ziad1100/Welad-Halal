import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface DailySummary {
  date: string;
  totalSales: number;
  totalOrders: number;
  topItems: { name: string; quantity: number; total: number }[];
  totalExpenses: number;
  netCashPosition: number;
}

/**
 * Section 3 — Daily Sales Summary Report data.
 * All money figures are computed in the DB timezone; the cron decides when to
 * run, this service decides what to report.
 */
@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  constructor(private prisma: PrismaService) {}

  async build(date = new Date()): Promise<DailySummary> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    // Confirmed/completed sales that day (cancelled/returned orders excluded —
    // their cash left the drawer again and is reflected in net position below).
    const salesAgg = await this.prisma.order.aggregate({
      _sum: { total: true },
      _count: { id: true },
      where: { status: { in: ['CONFIRMED', 'COMPLETED'] }, closedAt: { gte: start, lte: end } },
    });

    const topRows = await this.prisma.orderItem.groupBy({
      by: ['productNameSnapshot'],
      where: { order: { status: { in: ['CONFIRMED', 'COMPLETED'] }, closedAt: { gte: start, lte: end } } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    const expensesAgg = await this.prisma.expense.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: start, lte: end } },
    });

    const totalSales = Number(salesAgg._sum.total ?? 0);
    const totalExpenses = Number(expensesAgg._sum.amount ?? 0);

    return {
      date: start.toISOString().slice(0, 10),
      totalSales,
      totalOrders: salesAgg._count.id ?? 0,
      topItems: topRows.map((r) => ({
        name: r.productNameSnapshot,
        quantity: Number(r._sum.quantity ?? 0),
        total: Number(r._sum.lineTotal ?? 0),
      })),
      totalExpenses,
      netCashPosition: totalSales - totalExpenses,
    };
  }

  /** Arabic human-readable message used for WhatsApp/email/in-app. */
  formatAr(s: DailySummary): string {
    const lines = [
      `📊 التقرير اليومي — ${s.date}`,
      `إجمالي المبيعات: ${s.totalSales.toFixed(2)} EGP`,
      `عدد الطلبات: ${s.totalOrders}`,
    ];
    if (s.topItems.length) {
      lines.push('الأصناف الأكثر مبيعاً:');
      s.topItems.forEach((t, i) => lines.push(`${i + 1}. ${t.name} — ${t.quantity} × ${t.total.toFixed(2)} EGP`));
    } else {
      lines.push('لا توجد مبيعات اليوم.');
    }
    lines.push(`إجمالي المصروفات: ${s.totalExpenses.toFixed(2)} EGP`);
    lines.push(`صافي النقدية التقديري: ${s.netCashPosition.toFixed(2)} EGP`);
    return lines.join('\n');
  }
}
