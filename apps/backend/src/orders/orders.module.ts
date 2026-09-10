import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController, PublicOrdersController } from './orders.controller';
import { PrismaService } from '../prisma.service';
import { DiscountsModule } from '../discounts/discounts.module';
import { SettingsModule } from '../settings/settings.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [DiscountsModule, SettingsModule, AlertsModule],
  controllers: [OrdersController, PublicOrdersController],
  providers: [OrdersService, PrismaService],
})
export class OrdersModule {}
