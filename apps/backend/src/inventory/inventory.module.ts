import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { StockTakeService } from './stocktake.service';
import { InventoryController } from './inventory.controller';
import { PrismaService } from '../prisma.service';
@Module({ controllers: [InventoryController], providers: [InventoryService, StockTakeService, PrismaService] })
export class InventoryModule {}
