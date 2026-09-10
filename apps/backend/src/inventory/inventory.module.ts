import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { StockTakeService } from './stocktake.service';
import { StockWatchCron } from './stock-watch.cron';
import { InventoryController } from './inventory.controller';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../common/cache.service';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [AlertsModule],
  controllers: [InventoryController],
  providers: [InventoryService, StockTakeService, StockWatchCron, PrismaService, CacheService],
})
export class InventoryModule {}
