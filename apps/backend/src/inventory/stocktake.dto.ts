import { IsString, IsOptional, IsNumber, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTakeDto {
  @IsString() name!: string;
}
export class CountLineDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0) countedQty!: number;
}
export class CountLinesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CountLineDto) lines!: CountLineDto[];
}
export class CreateBatchDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() batchNo?: string;
  @IsOptional() @IsString() expiryDate?: string;
  @IsNumber() @Min(0.001) quantity!: number;
}
