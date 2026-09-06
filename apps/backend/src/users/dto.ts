import { IsString, IsOptional, IsEmail, IsEnum, IsBoolean, MinLength } from 'class-validator';
export class CreateUserDto {
  @IsString() name!: string;
  @IsString() username!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(4) password!: string;
  @IsOptional() @IsEnum(['ADMIN','MANAGER','CASHIER'] as any) role?: 'ADMIN'|'MANAGER'|'CASHIER';
}
export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(4) password?: string;
  @IsOptional() @IsEnum(['ADMIN','MANAGER','CASHIER'] as any) role?: 'ADMIN'|'MANAGER'|'CASHIER';
  @IsOptional() @IsBoolean() active?: boolean;
}
