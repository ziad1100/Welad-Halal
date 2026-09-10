import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { SummaryService } from './summary.service';
import { SummaryNotifier } from './summary-notifier';
import { SummaryCron } from './summary.cron';
import { SummaryController } from './summary.controller';
import { PrismaService } from '../prisma.service';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [AlertsModule],
  controllers: [ReportsController, SummaryController],
  providers: [ReportsService, SummaryService, SummaryNotifier, SummaryCron, PrismaService],
})
export class ReportsModule {}
