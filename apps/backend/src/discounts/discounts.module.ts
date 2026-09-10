import { Module } from '@nestjs/common';
import { DiscountsController } from './discounts.controller';
import { DiscountsService } from './discounts.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [DiscountsController],
  providers: [DiscountsService, PrismaService],
  exports: [DiscountsService],
})
export class DiscountsModule {}
