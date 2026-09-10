import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { AlertsService } from '../alerts/alerts.service';

/**
 * §3/§7 — low-stock detection. Runs every 6h; re-alerts only when the situation
 * changed (an unread LOW_STOCK alert already exists → skip to avoid spam).
 */
@Injectable()
export class StockWatchCron {
  private readonly logger = new Logger(StockWatchCron.name);
  constructor(private prisma: PrismaService, private alerts: AlertsService) {}

  async scan() {
    const rows = await this.prisma.inventory.findMany({
      include: { product: { select: { name: true, nameAr: true } } },
      take: 500,
    });
    const low = rows.filter((r) => Number(r.quantity) <= Number(r.minimumQuantity));
    if (!low.length) return { count: 0, alerted: false };
    const recent = await this.prisma.alert.findFirst({
      where: { kind: 'LOW_STOCK', isRead: false },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) return { count: low.length, alerted: false, skipped: true };
    const items = low.map((r) => ({
      name: r.product?.nameAr || r.product?.name || '—',
      quantity: Number(r.quantity),
      minimumQuantity: Number(r.minimumQuantity),
    }));
    await this.alerts.lowStock(items);
    return { count: items.length, alerted: true };
  }

  @Cron('5 */6 * * *') // every 6 hours at :05
  async run() {
    try {
      const r = await this.scan();
      if (r.alerted) this.logger.log(`Low-stock alert sent (${r.count} items)`);
    } catch (e) {
      this.logger.error(`Low-stock scan failed: ${(e as Error).message}`);
    }
  }
}
