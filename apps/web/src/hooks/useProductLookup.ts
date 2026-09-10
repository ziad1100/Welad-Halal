import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

/**
 * §1 — Unified product-by-barcode lookup hook. Returns the COMPLETE product
 * record (inventory, batches, components, supplier, last purchase info)
 * from the enhanced backend endpoint. Used across all screens that need
 * barcode lookup: Cashier, Inventory, Purchases, Stock Take, New Product.
 */
export interface ProductLookupResult {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  barcode?: string;
  sku?: string;
  productType: string;
  unit: string;
  unitOfMeasure?: string;
  supplierCode?: string;
  purchasePrice: number;
  retailPrice: number;
  taxRate: number;
  priceTiers?: { tier: string; price: number }[];
  subUnits?: { unit: string; factor: number; price: number; taxRate?: number }[];
  active: boolean;
  category?: { id: string; name: string; nameAr?: string };
  inventory?: { quantity: number; minimumQuantity: number };
  supplier?: { id: string; name: string; phone?: string };
  batches?: { id: string; batchNo?: string; expiryDate?: string; quantity: number; daysLeft?: number }[];
  components?: { componentId: string; quantity: number; component: { id: string; name: string; nameAr?: string; barcode?: string; unit: string; inventory?: { quantity: number } } }[];
  lastPurchasePrice?: number | null;
  lastPurchaseDate?: string | null;
  lastPurchaseSupplier?: string | null;
  nearestExpiry?: { id: string; batchNo?: string; expiryDate?: string; quantity: number; daysLeft?: number } | null;
}

export function useProductLookup(code: string | null) {
  return useQuery({
    queryKey: ['product-lookup', code],
    queryFn: async (): Promise<ProductLookupResult | null> => {
      if (!code) return null;
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
      return data;
    },
    enabled: !!code,
    staleTime: 15_000,     // Re-fetch after 15s for live stock
    gcTime: 60_000,        // Keep in memory for 60s
    retry: false,          // Don't retry on 404 (product not found)
  });
}
