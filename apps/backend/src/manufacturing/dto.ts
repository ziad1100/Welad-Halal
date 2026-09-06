import { IsString, IsNumber, Min } from 'class-validator';
export class SetComponentDto {
  @IsString() bundleId!: string;
  @IsString() componentId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
}
export class ComposeDto {
  @IsString() bundleId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
}
