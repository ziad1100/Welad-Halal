import { IsString, IsOptional, IsEmail, IsEnum, IsBoolean, MinLength } from 'class-validator';
export class CreateUserDto {
  @IsString() fullName!: string;
  @IsString() username!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(4) password?: string;
  /** Set when "generate temporary password" is used (server generates instead). */
  @IsOptional() @IsBoolean() generatePassword?: boolean;
  @IsOptional() @IsEnum(['owner', 'manager', 'employee'] as any) role?: 'owner' | 'manager' | 'employee';
}
export class UpdateUserDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(4) password?: string;
  @IsOptional() @IsEnum(['owner', 'manager', 'employee'] as any) role?: 'owner' | 'manager' | 'employee';
  @IsOptional() @IsBoolean() isActive?: boolean;
}
