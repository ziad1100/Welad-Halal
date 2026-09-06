import { Module } from '@nestjs/common';
import { ManufacturingService } from './manufacturing.service';
import { ManufacturingController } from './manufacturing.controller';
import { PrismaService } from '../prisma.service';
@Module({ controllers: [ManufacturingController], providers: [ManufacturingService, PrismaService], exports: [ManufacturingService] })
export class ManufacturingModule {}
