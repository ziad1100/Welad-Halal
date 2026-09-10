import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../common/cache.service';
import { Decimal } from '@prisma/client/runtime/library';
import { SetComponentDto } from './dto';

@Injectable()
export class ManufacturingService {
  constructor(private prisma: PrismaService, private cache: CacheService) {}

  bundles() {
    return this.prisma.product.findMany({ where: { productType: 'BUNDLED_ITEM' }, include: { components: { include: { component: true } }, inventory: true }, orderBy: { name: 'asc' } });
  }

  async composition(bundleId: string) {
    const b = await this.prisma.product.findUnique({ where: { id: bundleId }, include: { components: { include: { component: { include: { inventory: true } } } } } });
    if (!b) throw new NotFoundException('المنتج غير موجود');
    if (b.productType !== 'BUNDLED_ITEM') throw new BadRequestException('المنتج ليس صنفاً مجمعاً');
    return b;
  }

  async setComponent(dto: SetComponentDto, userId: string) {
    const [bundle, comp] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: dto.bundleId } }),
      this.prisma.product.findUnique({ where: { id: dto.componentId } }),
    ]);
    if (!bundle || !comp) throw new NotFoundException('المنتج غير موجود');
    if (bundle.productType !== 'BUNDLED_ITEM') throw new BadRequestException('المنتج ليس صنفاً مجمعاً');
    if (dto.bundleId === dto.componentId) throw new BadRequestException('لا يمكن أن يحتوي الصنف على نفسه');
    const row = await this.prisma.productComponent.upsert({
      where: { bundleId_componentId: { bundleId: dto.bundleId, componentId: dto.componentId } },
      update: { quantity: new Decimal(dto.quantity) },
      create: { bundleId: dto.bundleId, componentId: dto.componentId, quantity: new Decimal(dto.quantity) },
    });
    await this.prisma.auditLog.create({ data: { action: 'manufacturing.compose', entity: 'Product', entityId: dto.bundleId, details: `${comp.name} x${dto.quantity}`, userId } });
    return row;
  }

  async removeComponent(bundleId: string, componentId: string) {
    return this.prisma.productComponent.delete({ where: { bundleId_componentId: { bundleId, componentId } } });
  }

  /** Assemble N bundle units from component stock (deduct components, add bundle stock). */
  async compose(bundleId: string, quantity: number, userId: string) {
    const bundle = await this.composition(bundleId);
    if (!bundle.components.length) throw new BadRequestException('الصنف المجمع لا يحتوي على مكونات');
    const qty = new Decimal(quantity);
    const result = await this.prisma.$transaction(async (tx) => {
      for (const c of bundle.components) {
        const need = new Decimal(c.quantity as any).mul(qty);
        const inv = await tx.inventory.findUnique({ where: { productId: c.componentId } });
        if (!inv || new Decimal(inv.quantity as any).lessThan(need)) {
          throw new ConflictException(`الكمية غير متاحة في المخزن: ${c.component.nameAr || c.component.name}`);
        }
      }
      for (const c of bundle.components) {
        const need = new Decimal(c.quantity as any).mul(qty);
        await tx.inventory.update({ where: { productId: c.componentId }, data: { quantity: { decrement: need } } });
        await tx.stockMovement.create({ data: { productId: c.componentId, type: 'ADJUSTMENT', quantity: new Decimal(need).neg(), referenceType: 'COMPOSE', referenceId: bundleId, notes: `تجميع ${bundle.nameAr || bundle.name} x${quantity}`, createdById: userId } });
      }
      await tx.inventory.upsert({ where: { productId: bundleId }, create: { productId: bundleId, quantity: qty }, update: { quantity: { increment: qty } } });
      await tx.stockMovement.create({ data: { productId: bundleId, type: 'PURCHASE', quantity: qty, referenceType: 'COMPOSE', referenceId: bundleId, createdById: userId } });
      await tx.auditLog.create({ data: { action: 'manufacturing.compose', entity: 'Product', entityId: bundleId, details: `x${quantity}`, userId } });
      return this.composition(bundleId);
    });
    // Invalidate cache for bundle and all its components
    const bundleProduct = await this.prisma.product.findUnique({ where: { id: bundleId }, select: { barcode: true } });
    await this.cache.invalidateProduct(bundleId, bundleProduct?.barcode);
    for (const c of bundle.components) {
      const compProduct = await this.prisma.product.findUnique({ where: { id: c.componentId }, select: { barcode: true } });
      await this.cache.invalidateProduct(c.componentId, compProduct?.barcode);
    }
    return result;
  }
}
