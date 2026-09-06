import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpsertProductDto } from './dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  list(search?: string, categoryId?: string, activeOnly = true) {
    return this.prisma.product.findMany({
      where: {
        ...(activeOnly ? { active: true } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { nameAr: { contains: search } }, { barcode: { contains: search } }, { sku: { contains: search } }] } : {}),
      },
      include: { category: true, inventory: true, supplier: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  byId(id: string) {
    return this.prisma.product.findUnique({ where: { id }, include: { category: true, inventory: true, supplier: true, components: { include: { component: true } }, prices: { orderBy: { effectiveFrom: 'desc' }, take: 10 } } });
  }

  byBarcode(barcode: string) {
    return this.prisma.product.findUnique({ where: { barcode }, include: { category: true, inventory: true, supplier: { select: { id: true, name: true } } } });
  }

  async create(dto: UpsertProductDto, userId: string) {
    if (dto.barcode) {
      const dup = await this.prisma.product.findUnique({ where: { barcode: dto.barcode } });
      if (dup) throw new ConflictException('الباركود مستخدم بالفعل');
    }
    if (dto.sku) {
      const dup = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (dup) throw new ConflictException('SKU مستخدم بالفعل');
    }
    const retail = dto.retailPrice ?? 0;
    const product = await this.prisma.product.create({
      data: {
        name: dto.name, nameAr: dto.nameAr, description: dto.description,
        barcode: dto.barcode || null, sku: dto.sku || null, categoryId: dto.categoryId || null,
        productType: dto.productType || 'INVENTORY_ITEM', unit: dto.unit || 'قطعة',
        unitOfMeasure: dto.unitOfMeasure, supplierCode: dto.supplierCode,
        purchasePrice: new Decimal(dto.purchasePrice ?? 0), retailPrice: new Decimal(retail),
        taxRate: new Decimal(dto.taxRate ?? 0), active: dto.active ?? true,
        priceTiers: dto.priceTiers ? JSON.parse(JSON.stringify(dto.priceTiers)) : undefined,
        subUnits: dto.subUnits ? JSON.parse(JSON.stringify(dto.subUnits)) : undefined,
        supplierId: dto.supplierId || null,
      },
    });
    await this.prisma.productPrice.create({ data: { productId: product.id, price: new Decimal(retail) } });
    const qty = dto.quantity ?? 0;
    await this.prisma.inventory.create({ data: { productId: product.id, quantity: new Decimal(qty), minimumQuantity: new Decimal(dto.minimumQuantity ?? 0) } });
    if (Number(qty) > 0) {
      await this.prisma.stockMovement.create({ data: { productId: product.id, type: 'OPENING_BALANCE', quantity: new Decimal(qty), createdById: userId } });
    }
    await this.prisma.auditLog.create({ data: { action: 'product.create', entity: 'Product', entityId: product.id, userId } });
    return this.byId(product.id);
  }

  async update(id: string, dto: UpsertProductDto, userId: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المنتج غير موجود');
    if (dto.barcode && dto.barcode !== existing.barcode) {
      const dup = await this.prisma.product.findUnique({ where: { barcode: dto.barcode } });
      if (dup) throw new ConflictException('الباركود مستخدم بالفعل');
    }
    const priceChanged = dto.retailPrice !== undefined && Number(dto.retailPrice) !== Number(existing.retailPrice);
    if (priceChanged) {
      await this.prisma.productPrice.updateMany({ where: { productId: id, effectiveTo: null }, data: { effectiveTo: new Date() } });
      await this.prisma.productPrice.create({ data: { productId: id, price: new Decimal(dto.retailPrice!) } });
      await this.prisma.auditLog.create({ data: { action: 'price.change', entity: 'Product', entityId: id, details: `${existing.retailPrice} -> ${dto.retailPrice}`, userId } });
    }
    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name ?? undefined, nameAr: dto.nameAr, description: dto.description,
        barcode: dto.barcode ?? undefined, sku: dto.sku ?? undefined,
        categoryId: dto.categoryId ?? undefined, productType: dto.productType ?? undefined,
        unit: dto.unit ?? undefined, unitOfMeasure: dto.unitOfMeasure, supplierCode: dto.supplierCode,
        purchasePrice: dto.purchasePrice !== undefined ? new Decimal(dto.purchasePrice) : undefined,
        retailPrice: dto.retailPrice !== undefined ? new Decimal(dto.retailPrice) : undefined,
        taxRate: dto.taxRate !== undefined ? new Decimal(dto.taxRate) : undefined,
        active: dto.active ?? undefined,
        priceTiers: dto.priceTiers ? JSON.parse(JSON.stringify(dto.priceTiers)) : undefined,
        subUnits: dto.subUnits ? JSON.parse(JSON.stringify(dto.subUnits)) : undefined,
        supplierId: dto.supplierId ?? undefined,
      },
    });
    return this.byId(updated.id);
  }

  async remove(id: string) {
    const used = await this.prisma.orderItem.count({ where: { productId: id } });
    if (used > 0) {
      await this.prisma.product.update({ where: { id }, data: { active: false } });
      return { deactivated: true };
    }
    await this.prisma.product.delete({ where: { id } });
    return { deleted: true };
  }
}
