import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}
  list(from?: string, to?: string) {
    return this.prisma.expense.findMany({
      where: { ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) },
      orderBy: { createdAt: 'desc' }, take: 300,
    });
  }
  async create(dto: { title: string; amount: number; category?: string; notes?: string }, userId: string) {
    const row = await this.prisma.expense.create({ data: { title: dto.title, amount: new Decimal(dto.amount), category: dto.category || 'general', notes: dto.notes, createdById: userId } });
    await this.prisma.auditLog.create({ data: { action: 'expense.create', entity: 'Expense', entityId: row.id, details: `${dto.title}: ${new Decimal(dto.amount).toString()}`, userId } });
    return row;
  }
}
