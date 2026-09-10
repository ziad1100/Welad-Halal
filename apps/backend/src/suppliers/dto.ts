import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { IsEgyptianPhone } from '../common/egyptian-phone';
export class UpsertSupplierDto {
  @IsString() name!: string;
  @IsOptional() @IsString() @IsEgyptianPhone() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
