import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { AlertsModule } from '../alerts/alerts.module';
import { SettingsModule } from '../settings/settings.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [AlertsModule, SettingsModule],
  controllers: [ShiftsController],
  providers: [ShiftsService, PrismaService],
})
export class ShiftsModule {}
