import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { UpsertCategoryDto } from './dto';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';

@ApiTags('Categories') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private svc: CategoriesService) {}
  @Get() list(@Query('active') active?: string) { return this.svc.list(active === 'true'); }
  @Post() @RequireLevel(50) create(@Body() dto: UpsertCategoryDto) { return this.svc.create(dto); }
  @Patch(':id') @RequireLevel(50) update(@Param('id') id: string, @Body() dto: UpsertCategoryDto) { return this.svc.update(id, dto); }
  @Delete(':id') @RequireLevel(50) remove(@Param('id') id: string) { return this.svc.remove(id); }
}
