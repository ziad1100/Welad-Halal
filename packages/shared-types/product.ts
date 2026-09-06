export type ProductType = 'INVENTORY_ITEM' | 'SERVICE_ITEM' | 'RAW_MATERIAL' | 'BUNDLED_ITEM';
export interface PriceTier { tier: string; price: number; }
export interface SubUnit { unit: string; factor: number; price: number; taxRate?: number; }
export interface Product {
  id: string; name: string; nameAr?: string; barcode?: string; sku?: string;
  categoryId?: string; productType: ProductType; unit: string;
  purchasePrice: number; retailPrice: number; taxRate: number;
  priceTiers?: PriceTier[]; subUnits?: SubUnit[]; supplierId?: string;
}
