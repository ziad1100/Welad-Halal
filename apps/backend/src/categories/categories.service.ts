import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpsertCategoryDto } from './dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}
  list(activeOnly = false) {
    return this.prisma.category.findMany({ where: activeOnly ? { active: true } : {}, orderBy: { name: 'asc' } });
  }
  async create(dto: UpsertCategoryDto) {
    try {
      return await this.prisma.category.create({ data: { name: dto.name, nameAr: dto.nameAr, active: dto.active ?? true } });
    } catch { throw new ConflictException('اسم التصنيف مستخدم بالفعل'); }
  }
  async update(id: string, dto: UpsertCategoryDto) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('التصنيف غير موجود');
    return this.prisma.category.update({ where: { id }, data: { name: dto.name, nameAr: dto.nameAr, active: dto.active } });
  }
  async remove(id: string) {
    const used = await this.prisma.product.count({ where: { categoryId: id } });
    if (used > 0) throw new ConflictException('لا يمكن حذف تصنيف مرتبط بمنتجات');
    return this.prisma.category.delete({ where: { id } });
  }
}
