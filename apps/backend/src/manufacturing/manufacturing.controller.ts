import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ManufacturingService } from './manufacturing.service';
import { SetComponentDto, ComposeDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Manufacturing') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('manufacturing')
export class ManufacturingController {
  constructor(private svc: ManufacturingService) {}
  @Get('bundles') bundles() { return this.svc.bundles(); }
  @Get('bundles/:id') composition(@Param('id') id: string) { return this.svc.composition(id); }
  @Post('components') @RequireLevel(50) set(@Body() dto: SetComponentDto, @CurrentUser() u: ReqUser) { return this.svc.setComponent(dto, u.id); }
  @Delete('components/:bundleId/:componentId') @RequireLevel(50) remove(@Param('bundleId') b: string, @Param('componentId') c: string) { return this.svc.removeComponent(b, c); }
  @Post('compose') @RequireLevel(50) compose(@Body() dto: ComposeDto, @CurrentUser() u: ReqUser) { return this.svc.compose(dto.bundleId, dto.quantity, u.id); }
}
