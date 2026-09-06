import { Module } from '@nestjs/common';
import { BarcodeService } from './barcode.service';
import { BarcodeController } from './barcode.controller';
import { PrismaService } from '../prisma.service';
@Module({ controllers: [BarcodeController], providers: [BarcodeService, PrismaService] })
export class BarcodeModule {}
