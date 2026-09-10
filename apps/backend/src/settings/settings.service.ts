import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * System settings: simple typed key/value store in the DB with in-memory
 * caching. Defaults live here so a fresh install works with zero rows.
 * Writers bust the cache; readers are one indexed PK lookup at most.
 */
export const SETTING_DEFAULTS: Record<string, string> = {
  // Section 3 — cash drawer discrepancy alert threshold (EGP)
  cash_discrepancy_threshold: '20',
  // Section 6 — store temporarily closed to EXTERNAL ordering channels.
  // The in-store Cashier screen is never affected by this flag.
  store_accepting_orders: 'true',
  // Section 1 — store phone printed as a fixed receipt line ("للتواصل: …").
  store_phone: '',
  // Section 2 — Customer Display mirror (secondary window/screen).
  customer_display_enabled: 'true',
  // Section 7 — returns at/above this amount need manager/owner approval
  // before stock is restored and cash leaves the drawer.
  return_approval_threshold: '500',
};

/**
 * Public-facing subset readable without auth (receipt printing, store badge).
 * Never contains credentials or thresholds beyond what a receipt needs.
 */
export const PUBLIC_SETTINGS: string[] = ['store_phone', 'store_accepting_orders', 'customer_display_enabled'];

/**
 * §2/§6 — external intake must reject while the store is closed to orders.
 * Kept as a reusable assertion so the future online channel calls the same
 * enforcement point instead of duplicating the check. HTTP 400 so Nest
 * serializes it as a proper error without a controller try/catch.
 */
export class StoreClosedException extends BadRequestException {
  constructor() {
    super('المحل مغلق مؤقتًا');
    this.name = 'StoreClosedException';
  }
}

export type SettingKey = keyof typeof SETTING_DEFAULTS | (string & {});

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, string>();

  constructor(private prisma: PrismaService) {}

  async get(key: SettingKey): Promise<string> {
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    const value = row?.value ?? SETTING_DEFAULTS[key] ?? '';
    this.cache.set(key, value);
    return value;
  }

  async getNumber(key: SettingKey, fallback = 0): Promise<number> {
    const raw = await this.get(key);
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  async getBool(key: SettingKey, fallback = false): Promise<boolean> {
    const raw = (await this.get(key)).trim().toLowerCase();
    if (raw === 'true' || raw === '1' || raw === 'yes') return true;
    if (raw === 'false' || raw === '0' || raw === 'no') return false;
    return fallback;
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    this.cache.set(key, value);
    this.logger.log(`Setting updated: ${key}`);
  }

  /** All known settings merged over defaults — for the Administration UI. */
  async listAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany();
    const out: Record<string, string> = { ...SETTING_DEFAULTS };
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  /** Public subset for unauthenticated consumers (receipts, store status). */
  async publicValues(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: PUBLIC_SETTINGS } } });
    const out: Record<string, string> = {};
    for (const key of PUBLIC_SETTINGS) out[key] = SETTING_DEFAULTS[key] ?? '';
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  /**
   * §6 — throws StoreClosedException when external ordering is paused.
   * The in-store POS never calls this; only external/online intake does.
   */
  async assertExternalOrdersAllowed(): Promise<void> {
    if (!(await this.getBool('store_accepting_orders', true))) {
      throw new StoreClosedException();
    }
  }
}

