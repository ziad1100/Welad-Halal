import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../common/cache.service';
@Module({ controllers: [ProductsController], providers: [ProductsService, PrismaService, CacheService] })
export class ProductsModule {}
