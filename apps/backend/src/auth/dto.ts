import { IsString, IsOptional, MinLength } from 'class-validator';
export class LoginDto {
  @IsString() username!: string;
  @IsString() @MinLength(1) password!: string;
}
export class ChangePasswordDto {
  @IsOptional() @IsString() currentPassword?: string;
  @IsString() @MinLength(4) newPassword!: string;
}
