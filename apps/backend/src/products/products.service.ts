import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../common/cache.service';
import { UpsertProductDto } from './dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService, private cache: CacheService) {}

  /**
   * §5 — fuzzy product search. Barcode/SKU stay EXACT matches only (precise
   * identifiers are never fuzzy-matched); the free-text path ranks by
   * PostgreSQL pg_trgm similarity over name + nameAr so typos and partial
   * substrings anywhere in the name still hit, best match first.
   */
  async list(search?: string, categoryId?: string, activeOnly = true) {
    const s = String(search || '').trim();
    const where: any = {
      ...(activeOnly ? { active: true } : {}),
      ...(categoryId ? { categoryId } : {}),
    };

    // No search → plain list (browsing). With search → ranked fuzzy results.
    if (!s) {
      return this.prisma.product.findMany({
        where,
        include: { category: true, inventory: true, supplier: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
        take: 200,
      });
    }

    // Exact identifier paths first: full barcode or SKU match outranks fuzzy.
    const exact = await this.prisma.product.findMany({
      where: { ...where, OR: [{ barcode: s }, { sku: s }] },
      include: { category: true, inventory: true, supplier: { select: { id: true, name: true } } },
      take: 10,
    });

    // Trigram candidates ordered by best name similarity.
    const cat = where.categoryId ? ` AND p."categoryId" = ${'$2'}` : '';
    const active = activeOnly ? ' AND p."active" = true' : '';
    const rows: { id: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT p.id FROM "Product" p
       WHERE (p."name" % $1 OR p."nameAr" % $1 OR p."name" ILIKE '%' || $1 || '%' OR p."nameAr" ILIKE '%' || $1 || '%')` +
      cat + active +
      ` ORDER BY GREATEST(
           similarity(coalesce(p."nameAr", p."name"), $1),
           similarity(p."name", $1)
         ) DESC, p."name" ASC LIMIT 200`,
      ...(categoryId ? [s, categoryId] : [s]),
    );
    const ids = rows.map((r) => r.id);
    if (!ids.length) {
      // Fall back to plain contains when trigram finds nothing short (1–2 chars).
      return this.prisma.product.findMany({
        where: { ...where, OR: [{ name: { contains: s, mode: 'insensitive' } }, { nameAr: { contains: s } }] },
        include: { category: true, inventory: true, supplier: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
        take: 200,
      });
    }
    const matched = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { category: true, inventory: true, supplier: { select: { id: true, name: true } } },
    });
    const byId = new Map(matched.map((p) => [p.id, p]));
    // Re-order ranked ids first, then exact id matches that the fuzzy pass
    // may have missed (e.g. barcode search on non-text field) — dedupe by id.
    const seen = new Set<string>();
    const out: any[] = [];
    for (const id of [...ids, ...exact.map((e) => e.id)]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const row = byId.get(id);
      if (row) out.push(row);
    }
    return out.slice(0, 200);
  }

  byId(id: string) {
    return this.prisma.product.findUnique({ where: { id }, include: { category: true, inventory: true, supplier: true, components: { include: { component: true } }, prices: { orderBy: { effectiveFrom: 'desc' }, take: 10 } } });
  }

  /**
   * §1 — Unified barcode lookup: returns the COMPLETE product record including
   * inventory, batches (expiry), components (BOM), supplier, and last purchase
   * info. Cached in Redis (30s TTL) for fast repeated scans during a shift.
   */
  async byBarcode(barcode: string) {
    const cacheKey = `product:barcode:${barcode}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* cache corruption — re-fetch */ }
    }

    const product = await this.prisma.product.findUnique({
      where: { barcode },
      include: {
        category: true,
        inventory: true,
        supplier: { select: { id: true, name: true, phone: true } },
        batches: {
          where: { expiryDate: { not: null } },
          orderBy: { expiryDate: 'asc' },
          take: 5,
        },
        components: {
          include: {
            component: {
              select: { id: true, name: true, nameAr: true, barcode: true, unit: true, inventory: true },
            },
          },
        },
      },
    });

    if (!product) return null;

    // Last purchase info: most recent purchase price and date for this product.
    const lastPurchase = await this.prisma.purchaseItem.findFirst({
      where: { productId: product.id },
      orderBy: { purchaseOrder: { createdAt: 'desc' } },
      select: { purchasePrice: true, purchaseOrder: { select: { createdAt: true, supplierName: true } } },
    });

    const result = {
      ...product,
      lastPurchasePrice: lastPurchase ? Number(lastPurchase.purchasePrice) : null,
      lastPurchaseDate: lastPurchase?.purchaseOrder?.createdAt ?? null,
      lastPurchaseSupplier: lastPurchase?.purchaseOrder?.supplierName ?? null,
      nearestExpiry: product.batches.length > 0 ? product.batches[0] : null,
    };

    // Cache for 30 seconds — fast enough for repeated scans, fresh enough for stock changes.
    await this.cache.set(cacheKey, JSON.stringify(result), 30);
    return result;
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
    // BOM: bundle components are part of the same creation request.
    if (dto.productType === 'BUNDLED_ITEM' && dto.components?.length) {
      for (const c of dto.components) {
        const comp = await this.prisma.product.findUnique({ where: { id: c.productId } });
        if (!comp) throw new NotFoundException('المنتج المكون غير موجود');
        if (!(Number(c.quantity) > 0)) throw new BadRequestException('كمية المكون غير صالحة');
        await this.prisma.productComponent.create({ data: { bundleId: product.id, componentId: c.productId, quantity: new Decimal(c.quantity) } });
      }
    }
    const qty = dto.quantity ?? 0;
    await this.prisma.inventory.create({ data: { productId: product.id, quantity: new Decimal(qty), minimumQuantity: new Decimal(dto.minimumQuantity ?? 0) } });
    if (Number(qty) > 0) {
      await this.prisma.stockMovement.create({ data: { productId: product.id, type: 'OPENING_BALANCE', quantity: new Decimal(qty), createdById: userId } });
    }
    await this.prisma.auditLog.create({ data: { action: 'product.create', entity: 'Product', entityId: product.id, userId } });
    await this.cache.invalidateProduct(product.id, product.barcode);
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
    await this.cache.invalidateProduct(id, existing.barcode);
    if (dto.barcode && dto.barcode !== existing.barcode) {
      await this.cache.invalidateProduct(id, dto.barcode);
    }
    return this.byId(updated.id);
  }

  async remove(id: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    const used = await this.prisma.orderItem.count({ where: { productId: id } });
    if (used > 0) {
      await this.prisma.product.update({ where: { id }, data: { active: false } });
      await this.cache.invalidateProduct(id, existing?.barcode);
      return { deactivated: true };
    }
    await this.prisma.product.delete({ where: { id } });
    await this.cache.invalidateProduct(id, existing?.barcode);
    return { deleted: true };
  }
}
