import { IsString, IsOptional, IsNumber, IsEnum, IsBoolean, Min } from 'class-validator';
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
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) minimumQuantity?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
