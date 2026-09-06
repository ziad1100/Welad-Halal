import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
export class UpsertEmployeeDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsNumber() @Min(0) salary?: number;
  @IsOptional() @IsString() hireDate?: string;
  @IsOptional() @IsString() role?: 'manager' | 'employee';
  @IsOptional() active?: boolean;
}
