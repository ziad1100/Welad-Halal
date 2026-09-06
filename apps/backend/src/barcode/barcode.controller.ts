import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BarcodeService } from './barcode.service';
import { AuthGuard } from '../common/auth.guard';

@ApiTags('Barcode') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('barcode')
export class BarcodeController {
  constructor(private svc: BarcodeService) {}
  @Get(':code') lookup(@Param('code') code: string) { return this.svc.lookup(code); }
}
