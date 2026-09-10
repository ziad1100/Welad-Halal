import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController, PublicSettingsController, StoreController } from './settings.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [SettingsController, PublicSettingsController, StoreController],
  providers: [SettingsService, PrismaService],
  exports: [SettingsService],
})
export class SettingsModule {}
