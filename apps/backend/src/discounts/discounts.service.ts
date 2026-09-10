import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DiscountCodeDto } from './dto';

export interface CodeCheck {
  code: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  /** Discount amount computed against a subtotal (0 when invalid). */
  discountAmount: number;
  valid: boolean;
  reason?: string;
}

/**
 * §2 — one promotions system. Codes are validated HERE (authoritative) and the
 * same routine is reused by the Cashier discount preview and by order
 * confirmation, so the client can never show a discount the server rejects.
 */
@Injectable()
export class DiscountsService {
  constructor(private prisma: PrismaService) {}

  private normalize(code: string): string {
    return String(code || '').trim().toUpperCase();
  }

  async list() {
    return this.prisma.discountCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async byCode(code: string) {
    return this.prisma.discountCode.findUnique({ where: { code: this.normalize(code) } });
  }

  async create(dto: DiscountCodeDto, userId: string) {
    const code = this.normalize(dto.code);
    if (code.length < 2) throw new BadRequestException('كود الخصم قصير جداً');
    const exists = await this.prisma.discountCode.findUnique({ where: { code } });
    if (exists) throw new BadRequestException('كود الخصم مستخدم بالفعل');
    const row = await this.prisma.discountCode.create({
      data: {
        code,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        usageLimit: dto.usageLimit ?? null,
        isActive: dto.isActive ?? true,
        notes: dto.notes ?? null,
      },
    });
    await this.prisma.auditLog.create({ data: { action: 'discount.create', entity: 'DiscountCode', entityId: row.id, details: code, userId } });
    return row;
  }

  async update(id: string, dto: Partial<DiscountCodeDto>, userId: string) {
    const existing = await this.prisma.discountCode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('كود الخصم غير موجود');
    const code = dto.code ? this.normalize(dto.code) : existing.code;
    if (dto.code && code !== existing.code) {
      const dup = await this.prisma.discountCode.findUnique({ where: { code } });
      if (dup) throw new BadRequestException('كود الخصم مستخدم بالفعل');
    }
    const row = await this.prisma.discountCode.update({
      where: { id },
      data: {
        code,
        ...(dto.discountType ? { discountType: dto.discountType } : {}),
        ...(dto.discountValue !== undefined ? { discountValue: dto.discountValue } : {}),
        ...(dto.validFrom !== undefined ? { validFrom: dto.validFrom ? new Date(dto.validFrom) : null } : {}),
        ...(dto.validUntil !== undefined ? { validUntil: dto.validUntil ? new Date(dto.validUntil) : null } : {}),
        ...(dto.usageLimit !== undefined ? { usageLimit: dto.usageLimit } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.prisma.auditLog.create({ data: { action: 'discount.update', entity: 'DiscountCode', entityId: id, details: code, userId } });
    return row;
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.discountCode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('كود الخصم غير موجود');
    // Soft-disable: keeps usage history and prevents re-use with the same code.
    const row = await this.prisma.discountCode.update({ where: { id }, data: { isActive: false } });
    await this.prisma.auditLog.create({ data: { action: 'discount.deactivate', entity: 'DiscountCode', entityId: id, details: existing.code, userId } });
    return row;
  }

  /**
   * Preview for the Cashier "كود خصم" field — returns the exact amount that
   * order confirmation would apply (pure function; never mutates usage).
   */
  async preview(code: string, subtotal: number): Promise<CodeCheck> {
    const c = await this.byCode(code);
    return this.check(c, subtotal);
  }

  /** Core validity + amount logic (no DB writes). Used by preview + confirm. */
  private check(row: any, subtotal: number): CodeCheck {
    const base = { code: this.normalize(row?.code || ''), discountType: (row?.discountType || 'percentage') as 'percentage' | 'fixed_amount', discountValue: Number(row?.discountValue || 0), discountAmount: 0, valid: false };
    if (!row) return { ...base, reason: 'كود الخصم غير صحيح' };
    if (!row.isActive) return { ...base, reason: 'كود الخصم غير مفعّل' };
    const now = new Date();
    if (row.validFrom && new Date(row.validFrom) > now) return { ...base, reason: 'كود الخصم لم يبدأ بعد' };
    if (row.validUntil && new Date(row.validUntil) < now) return { ...base, reason: 'انتهت صلاحية كود الخصم' };
    if (row.usageLimit !== null && row.usageLimit !== undefined && Number(row.timesUsed) >= Number(row.usageLimit)) {
      return { ...base, reason: 'تم استنفاد كود الخصم' };
    }
    const s = Number(subtotal) || 0;
    const amount = row.discountType === 'fixed_amount' ? Math.min(base.discountValue, s) : Math.round((s * base.discountValue) / 100 * 100) / 100;
    return { ...base, discountAmount: Math.round(amount * 100) / 100, valid: true };
  }

  /** Server-side validation at order confirmation. Throws Arabic error on any invalid state. */
  async validateForConfirm(code: string, subtotal: number): Promise<{ row: any; amount: number }> {
    const c = await this.byCode(code);
    const chk = this.check(c, subtotal);
    if (!chk.valid) throw new BadRequestException(chk.reason || 'كود الخصم غير صحيح');
    return { row: c, amount: chk.discountAmount };
  }

  /** Atomically consume one usage (order confirmation). Returns updated row. */
  async consume(code: string) {
    return this.prisma.discountCode.update({ where: { code: this.normalize(code) }, data: { timesUsed: { increment: 1 } } });
  }
}
