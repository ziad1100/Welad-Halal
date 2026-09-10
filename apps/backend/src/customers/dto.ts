import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { IsEgyptianPhone } from '../common/egyptian-phone';
export class UpsertCustomerDto {
  @IsString() name!: string;
  @IsOptional() @IsString() @IsEgyptianPhone() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() balance?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
