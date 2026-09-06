import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ManufacturingService } from './manufacturing.service';
import { SetComponentDto, ComposeDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';

@ApiTags('Manufacturing') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('manufacturing')
export class ManufacturingController {
  constructor(private svc: ManufacturingService) {}
  @Get('bundles') bundles() { return this.svc.bundles(); }
  @Get('bundles/:id') composition(@Param('id') id: string) { return this.svc.composition(id); }
  @Post('components') @Roles('ADMIN', 'MANAGER') set(@Body() dto: SetComponentDto, @CurrentUser() u: ReqUser) { return this.svc.setComponent(dto, u.id); }
  @Delete('components/:bundleId/:componentId') @Roles('ADMIN', 'MANAGER') remove(@Param('bundleId') b: string, @Param('componentId') c: string) { return this.svc.removeComponent(b, c); }
  @Post('compose') @Roles('ADMIN', 'MANAGER') compose(@Body() dto: ComposeDto, @CurrentUser() u: ReqUser) { return this.svc.compose(dto.bundleId, dto.quantity, u.id); }
}
