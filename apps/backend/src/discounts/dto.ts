import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class DiscountCodeDto {
  @ApiProperty({ example: 'WELAD10' })
  @IsString()
  code!: string;

  @ApiProperty({ enum: ['percentage', 'fixed_amount'], example: 'percentage' })
  @IsEnum(['percentage', 'fixed_amount'])
  discountType!: 'percentage' | 'fixed_amount';

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue!: number;

  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsInt() @Min(0) usageLimit?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() notes?: string;
}
