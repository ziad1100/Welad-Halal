import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AlertsGateway } from './alerts.gateway';
import { PushService } from '../push/push.service';

export interface CashDiscrepancyPayload {
  shiftId: string;
  cashier: string;
  expected: number;
  actual: number;
  difference: number;
  threshold: number;
}

/**
 * Section 3 — Smart Store Alerts.
 * Every alert is persisted (manager/owner inbox + future mobile app) and
 * broadcast in real time over the AlertsGateway.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private prisma: PrismaService, private gateway: AlertsGateway, private push: PushService) {}

  private async createAndBroadcast(input: {
    kind: 'CASH_DISCREPANCY' | 'PENDING_RETURN_APPROVAL' | 'LOW_STOCK' | 'DAILY_SUMMARY';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    title: string;
    message: string;
    payload?: any;
  }) {
    const alert = await this.prisma.alert.create({ data: input });
    this.gateway.emitToStaff('alert', alert);
    // §7 — mirror actionable kinds to manager phones via Web Push when configured.
    if (input.kind !== 'DAILY_SUMMARY') {
      const urlMap: Record<string, string> = {
        CASH_DISCREPANCY: '/#/m?tab=alerts',
        PENDING_RETURN_APPROVAL: '/#/m?tab=approvals',
        LOW_STOCK: '/#/m',
      };
      await this.push.sendToManagers(input.title, input.message, { kind: input.kind, alertId: alert.id, url: urlMap[input.kind] || '/#/m', ...(input.payload || {}) });
    }
    return alert;
  }

  /** Cash drawer discrepancy — also written to the Audit Log by ShiftsService. */
  async cashDiscrepancy(p: CashDiscrepancyPayload) {
    const sign = p.difference < 0 ? 'نقص' : 'زيادة';
    return this.createAndBroadcast({
      kind: 'CASH_DISCREPANCY',
      severity: 'CRITICAL',
      title: '⚠️ فرق في درج النقدية',
      message:
        `الشيفت ${p.shiftId} — الكاشير ${p.cashier}: المتوقع ${p.expected.toFixed(2)} EGP، ` +
        `الفعلي ${p.actual.toFixed(2)} EGP، الفرق ${p.difference.toFixed(2)} EGP (${sign}) — الحد المسموح ${p.threshold} EGP`,
      payload: p,
    });
  }

  async dailySummary(report: Record<string, any>, message: string) {
    return this.createAndBroadcast({
      kind: 'DAILY_SUMMARY',
      severity: 'INFO',
      title: '📊 التقرير اليومي للمبيعات',
      message,
      payload: report,
    });
  }

  /** §7 — high-value return awaiting manager/owner approval (mobile or desktop). */
  async pendingReturnApproval(p: { orderId: string; orderNumber: number; amount: number; cashier: string }) {
    return this.createAndBroadcast({
      kind: 'PENDING_RETURN_APPROVAL',
      severity: 'WARNING',
      title: '⏳ مرتجع بانتظار الموافقة',
      message:
        `الطلب #${p.orderNumber} بقيمة ${p.amount.toFixed(2)} EGP (الكاشير: ${p.cashier}) يطلب موافقة المدير على المرتجع`,
      payload: p,
    });
  }

  /** §7 — low-stock alert list refresh (owner/manager + mobile). */
  async lowStock(items: { name: string; quantity: number; minimumQuantity: number }[]) {
    if (!items.length) return null;
    const lines = items.slice(0, 8).map((i) => `• ${i.name} (${i.quantity} / حد ${i.minimumQuantity})`).join('\n');
    const more = items.length > 8 ? `\n+ ${items.length - 8} أخرى` : '';
    return this.createAndBroadcast({
      kind: 'LOW_STOCK',
      severity: 'WARNING',
      title: '⚠️ أصناف قاربت على النفاد',
      message: `${lines}${more}`,
      payload: { count: items.length },
    });
  }

  list(params: { unreadOnly?: boolean; take?: number }) {
    return this.prisma.alert.findMany({
      where: params.unreadOnly ? { isRead: false } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(params.take) || 50, 200),
    });
  }

  unreadCount() {
    return this.prisma.alert.count({ where: { isRead: false } });
  }

  async markRead(id: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) return null;
    return this.prisma.alert.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
  }

  async markAllRead() {
    const res = await this.prisma.alert.updateMany({ where: { isRead: false }, data: { isRead: true, readAt: new Date() } });
    return { updated: res.count };
  }
}
