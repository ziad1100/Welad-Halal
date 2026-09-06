import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { UpsertCategoryDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { Roles } from '../common/roles.decorator';

@ApiTags('Categories') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private svc: CategoriesService) {}
  @Get() list(@Query('active') active?: string) { return this.svc.list(active === 'true'); }
  @Post() @Roles('ADMIN','MANAGER') create(@Body() dto: UpsertCategoryDto) { return this.svc.create(dto); }
  @Patch(':id') @Roles('ADMIN','MANAGER') update(@Param('id') id: string, @Body() dto: UpsertCategoryDto) { return this.svc.update(id, dto); }
  @Delete(':id') @Roles('ADMIN','MANAGER') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
