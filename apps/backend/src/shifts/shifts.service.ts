import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { SettingsService } from '../settings/settings.service';
import { OpenShiftDto, CloseShiftDto } from './dto';

/**
 * Section 4 — Shift & Cash Drawer Reconciliation.
 *
 * Cash attribution model (single-terminal store, drawer belongs to the
 * logged-in cashier):
 *  - Sales count when they were CONFIRMED (money enters the drawer):
 *    timestamp = closedAt (set on confirm/deduct) falling back to createdAt.
 *  - Refunds count when the money leaves the drawer: refundedAt is stamped on
 *    a previously-confirmed order when it is later cancelled or returned
 *    (see OrdersService).
 *  - expected_cash = opening_cash + confirmed sales during shift − refunds during shift
 *  - discrepancy   = counted closing cash − expected_cash
 */
@Injectable()
export class ShiftsService {
  constructor(
    private prisma: PrismaService,
    private alerts: AlertsService,
    private settings: SettingsService,
  ) {}

  /** Open a new shift for the current user (one open shift per cashier). */
  async open(userId: string, dto: OpenShiftDto) {
    const existing = await this.prisma.shift.findFirst({ where: { employee: { userId }, status: 'open' } });
    if (existing) throw new ConflictException('لديك شيفت مفتوح بالفعل — يجب إنهاؤه أولاً');
    // Employee row is 1:1 with User; auto-provision for staff without one.
    const employee = await this.prisma.employee.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return this.prisma.shift.create({
      data: {
        employeeId: employee.id,
        openingCashAmount: dto.openingCashAmount,
        expectedCashAmount: dto.openingCashAmount, // until sales/refunds accrue
      },
      include: { employee: { include: { user: { select: { username: true, fullName: true } } } } },
    });
  }

  currentForUser(userId: string) {
    return this.prisma.shift.findFirst({
      where: { employee: { userId }, status: 'open' },
      orderBy: { startedAt: 'desc' },
      include: { employee: { include: { user: { select: { username: true, fullName: true } } } } },
    });
  }

  /** Live expected cash for the End-Shift modal (not yet persisted). */
  async expectedCash(shiftId: string): Promise<{ expectedCash: number; sales: number; refunds: number }> {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('الشيفت غير موجود');
    const { sales, refunds } = await this.cashMovements(shift.employeeId, shift.startedAt, new Date());
    const expected = Number(shift.openingCashAmount) + sales - refunds;
    return { expectedCash: round2(expected), sales: round2(sales), refunds: round2(refunds) };
  }

  /** Sales & refunds that hit the drawer in a window for one cashier. */
  private async cashMovements(employeeId: string, from: Date, to: Date) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { userId: true } });
    if (!employee) return { sales: 0, refunds: 0 };
    const userId = employee.userId;

    const salesAgg = await this.prisma.order.aggregate({
      _sum: { total: true },
      where: {
        createdById: userId,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        // §4 — only CASH orders sit in the drawer; card/online sales don't.
        paymentMethod: 'CASH',
        OR: [
          { closedAt: { gte: from, lte: to } },
          { closedAt: null, createdAt: { gte: from, lte: to } },
        ],
      },
    });
    // Refunds = previously-confirmed orders cancelled or returned in the window
    // (refundedAt stamped by OrdersService at the moment cash left the drawer).
    const refundsAgg = await this.prisma.order.aggregate({
      _sum: { total: true },
      where: {
        refundedById: userId,
        refundedAt: { gte: from, lte: to },
        status: { in: ['CANCELLED', 'RETURNED'] },
        // Card refunds never pass through the drawer either.
        paymentMethod: 'CASH',
      },
    });
    return { sales: Number(salesAgg._sum.total ?? 0), refunds: Number(refundsAgg._sum.total ?? 0) };
  }

  /** Count the drawer and close the shift. Alerts manager/owner on discrepancy. */
  async close(shiftId: string, dto: CloseShiftDto, user: { id: string; permissionLevel: number }) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { employee: { include: { user: { select: { id: true, username: true, fullName: true } } } } },
    });
    if (!shift) throw new NotFoundException('الشيفت غير موجود');
    if (shift.status === 'closed') throw new ConflictException('الشيفت مغلق بالفعل');
    const isOwn = shift.employee.userId === user.id;
    if (!isOwn && user.permissionLevel < 50) {
      throw new ForbiddenException('لا يمكنك إنهاء شيفت موظف آخر');
    }

    const now = new Date();
    const { sales, refunds } = await this.cashMovements(shift.employeeId, shift.startedAt, now);
    const expected = round2(Number(shift.openingCashAmount) + sales - refunds);
    const discrepancy = round2(dto.closingCashAmount - expected);
    const threshold = await this.settings.getNumber('cash_discrepancy_threshold', 20);

    const closed = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        closingCashAmount: dto.closingCashAmount,
        expectedCashAmount: expected,
        discrepancyAmount: discrepancy,
        endedAt: now,
        status: 'closed',
        closedById: user.id,
      },
    });

    const cashier = shift.employee.user?.fullName || shift.employee.user?.username || '—';
    await this.prisma.auditLog.create({
      data: {
        action: 'shift.close',
        entity: 'Shift',
        entityId: closed.id,
        userId: user.id,
        details: JSON.stringify({
          shiftId: closed.id,
          cashier: shift.employee.user?.username ?? null,
          expected,
          actual: dto.closingCashAmount,
          difference: discrepancy,
          sales, refunds,
        }),
      },
    });

    // Section 3 — Cash Drawer Discrepancy Alert beyond the configured threshold.
    if (Math.abs(discrepancy) > threshold) {
      await this.alerts.cashDiscrepancy({
        shiftId: closed.id,
        cashier,
        expected,
        actual: dto.closingCashAmount,
        difference: discrepancy,
        threshold,
      });
    }

    return closed;
  }

  /** Manager/Owner shift history with per-employee filtering. */
  list(params: { employeeId?: string; status?: string; take?: number; skip?: number }) {
    const { employeeId, status, take = 100, skip = 0 } = params;
    return this.prisma.shift.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(status === 'open' || status === 'closed' ? { status } : {}),
      },
      include: { employee: { include: { user: { select: { username: true, fullName: true } } } }, closedBy: { select: { username: true, fullName: true } } },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Number(take) || 100, 500),
      skip: Number(skip) || 0,
    });
  }

  /** Distinct employees that have shifts — for the history filter dropdown. */
  async employeesWithShifts() {
    const rows = await this.prisma.shift.findMany({
      distinct: ['employeeId'],
      select: { employee: { select: { id: true, user: { select: { username: true, fullName: true } } } } },
      take: 200,
    });
    return rows.map((r) => ({ id: r.employee.id, username: r.employee.user?.username, fullName: r.employee.user?.fullName }));
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
