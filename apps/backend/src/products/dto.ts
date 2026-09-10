import { IsString, IsOptional, IsNumber, IsEnum, IsBoolean, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
export class PriceTierDto {
  @IsString() tier!: string;
  @IsNumber() @Min(0) price!: number;
}
export class ProductComponentDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
}
export class SubUnitDto {
  @IsString() unit!: string;
  @IsNumber() @Min(0.001) factor!: number;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
}
export class UpsertProductDto {
  @IsString() name!: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsEnum(['INVENTORY_ITEM','SERVICE_ITEM','RAW_MATERIAL','BUNDLED_ITEM'] as any) productType?: any;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() unitOfMeasure?: string;
  @IsOptional() @IsString() supplierCode?: string;
  @IsOptional() @IsNumber() @Min(0) purchasePrice?: number;
  @IsOptional() @IsNumber() @Min(0) retailPrice?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsArray() priceTiers?: PriceTierDto[];
  @IsOptional() @IsArray() subUnits?: SubUnitDto[];
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) minimumQuantity?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  // BOM for BUNDLED_ITEM (صنف مجموع): components saved with the product.
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProductComponentDto) components?: ProductComponentDto[];
}
