import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsGateway } from './alerts.gateway';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../prisma.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsGateway, PrismaService],
  exports: [AlertsService, AlertsGateway],
})
export class AlertsModule {}
