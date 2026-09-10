import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../common/cache.service';
@Module({ controllers: [PurchasesController], providers: [PurchasesService, PrismaService, CacheService] })
export class PurchasesModule {}
