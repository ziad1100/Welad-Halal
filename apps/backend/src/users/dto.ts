import { IsString, IsOptional, IsEnum, IsBoolean, MinLength, IsArray, IsEmail } from 'class-validator';
export class CreateUserDto {
  @IsString() fullName!: string;
  @IsString() @MinLength(3) username!: string;
  @IsOptional() @IsString() @MinLength(4) password?: string;
  @IsOptional() @IsString() @MinLength(4) confirmPassword?: string;
  /** Set when "generate temporary password" is used (server generates instead). */
  @IsOptional() @IsBoolean() generatePassword?: boolean;
  @IsOptional() @IsEnum(['owner', 'manager', 'employee'] as any) role?: 'owner' | 'manager' | 'employee';
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
}
export class UpdateUserDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEnum(['owner', 'manager', 'employee'] as any) role?: 'owner' | 'manager' | 'employee';
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
}
export class ResetPasswordDto {
  @IsOptional() @IsString() @MinLength(4) password?: string;
  @IsOptional() @IsBoolean() generateTempPassword?: boolean;
}
export class ChangeRoleDto {
  @IsEnum(['manager', 'employee'] as any) role!: 'manager' | 'employee';
}
export class UpdatePermissionsDto {
  @IsArray() @IsString({ each: true }) permissions!: string[];
}
