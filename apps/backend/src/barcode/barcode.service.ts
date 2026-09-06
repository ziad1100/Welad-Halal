import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Barcode lookup: local DB first (source of truth), then Open Food Facts
 * to pre-fill the New Product form. External failures never throw —
 * the cashier falls back to manual entry.
 */
@Injectable()
export class BarcodeService {
  constructor(private prisma: PrismaService) {}

  async lookup(code: string) {
    const local = await this.prisma.product.findUnique({ where: { barcode: code }, include: { category: true, inventory: true } });
    if (local) return { found: true as const, source: 'local', product: local };

    let suggestion: any = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json: any = await res.json();
        const p = json?.product;
        if (json?.status === 1 && p) {
          suggestion = {
            source: 'openfoodfacts',
            name: p.product_name || p.product_name_ar || '',
            brands: p.brands || '',
            quantity: p.quantity || '',
          };
        }
      }
    } catch { suggestion = null; }
    return { found: false as const, suggestion };
  }
}
