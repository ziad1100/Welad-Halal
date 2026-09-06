import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
export class AdjustDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsString() notes?: string;
}
export class SetStockDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsOptional() @IsString() notes?: string;
}
