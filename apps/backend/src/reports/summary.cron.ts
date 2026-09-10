import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { SummaryService } from './summary.service';
import { SummaryNotifier } from './summary-notifier';

/**
 * Section 3 — Daily Sales Summary scheduled job.
 * Runs at a configurable fixed time (default 23:59) using a 6-field cron
 * expression from DAILY_SUMMARY_CRON. Delivers via WhatsApp → Email → log,
 * and always stores the report as an in-app DAILY_SUMMARY alert.
 */
@Injectable()
export class SummaryCron {
  private readonly logger = new Logger(SummaryCron.name);

  constructor(
    private prisma: PrismaService,
    private summary: SummaryService,
    private notifier: SummaryNotifier,
    private alerts: AlertsService,
  ) {}

  @Cron(process.env.DAILY_SUMMARY_CRON || '59 23 * * *')
  async run() {
    try {
      const report = await this.summary.build(new Date());
      const message = this.summary.formatAr(report);
      const channel = await this.notifier.deliver(message);
      await this.alerts.dailySummary({ ...report, deliveredVia: channel }, message);
      this.logger.log(`Daily summary delivered via ${channel}`);
    } catch (e) {
      this.logger.error(`Daily summary failed: ${(e as Error).message}`);
    }
  }

  /** Manual trigger (owner/manager) for testing or re-delivery. */
  async runNow() {
    const report = await this.summary.build(new Date());
    const message = this.summary.formatAr(report);
    const channel = await this.notifier.deliver(message);
    await this.alerts.dailySummary({ ...report, deliveredVia: channel }, message);
    return { report, message, channel };
  }
}
