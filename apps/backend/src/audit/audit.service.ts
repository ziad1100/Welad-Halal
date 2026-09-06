import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  list(action?: string, take = 200) {
    return this.prisma.auditLog.findMany({
      where: action && action !== 'ALL' ? { action } : {},
      include: { user: { select: { username: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 200, 500),
    });
  }
}
