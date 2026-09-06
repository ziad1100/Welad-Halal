import { IsString, IsOptional, IsEnum, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderLineDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  // NOTE: unitPrice from frontend is IGNORED by backend (price security).
  @IsOptional() @IsNumber() unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
}

export class CreateOrderDto {
  @IsOptional() @IsEnum(['PICKUP','RECEIVE','DELIVERY'] as any) orderType?: any;
  @IsOptional() @IsEnum(['PENDING','HELD','CONFIRMED','COMPLETED'] as any) status?: any;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() deliveryRepId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrderLineDto) items!: OrderLineDto[];
}
