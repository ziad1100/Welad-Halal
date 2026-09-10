import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class OpenShiftDto {
  @ApiProperty({ example: 500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingCashAmount!: number;
}

export class CloseShiftDto {
  @ApiProperty({ example: 1735.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  closingCashAmount!: number;
}

export class UpdateSettingDto {
  @ApiProperty({ example: 'cash_discrepancy_threshold' })
  key!: string;

  @ApiProperty({ example: '20' })
  value!: string;
}
