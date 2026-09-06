import { IsString, IsOptional, IsBoolean } from 'class-validator';
export class UpsertCategoryDto {
  @IsString() name!: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
