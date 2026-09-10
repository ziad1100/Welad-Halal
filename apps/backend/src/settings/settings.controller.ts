import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { CurrentUser, ReqUser } from '../common/current-user';
import { SettingsService, SETTING_DEFAULTS } from './settings.service';

@ApiTags('Settings') @ApiBearerAuth() @UseGuards(AuthGuard) @RequireLevel(50)
@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  async list() {
    return { values: await this.settings.listAll(), defaults: SETTING_DEFAULTS };
  }

  @Patch()
  async update(@Body() body: { key?: string; value?: string }) {
    const key = String(body?.key || '').trim();
    if (!key || !(key in SETTING_DEFAULTS)) {
      return { ok: false, error: 'مفتاح إعداد غير معروف' };
    }
    await this.settings.set(key, String(body.value ?? ''));
    return { ok: true, key, value: await this.settings.get(key) };
  }
}

/** Public read (no auth): receipt printing + store status need these. */
@ApiTags('Settings')
@Controller('settings')
export class PublicSettingsController {
  constructor(private settings: SettingsService) {}
  @Get('public')
  public() {
    return this.settings.publicValues();
  }
}

/** §6 — external channels ask this before taking orders; POS ignores it. */
@ApiTags('Store')
@Controller('store')
export class StoreController {
  constructor(private settings: SettingsService) {}
  @Get('status')
  async status() {
    const publicValues = await this.settings.publicValues();
    return {
      acceptingOrders: publicValues.store_accepting_orders !== 'false',
      message: publicValues.store_accepting_orders === 'false' ? 'المحل مغلق مؤقتًا' : null,
    };
  }
  /** Owner/manager flips the store-closed flag from the Orders app toolbar. */
  @UseGuards(AuthGuard) @RequireLevel(50) @ApiBearerAuth()
  @Post('accepting')
  async setAccepting(@Body() body: { accepting?: boolean }, @CurrentUser() u: ReqUser) {
    await this.settings.set('store_accepting_orders', body?.accepting === false ? 'false' : 'true');
    void u;
    return this.status();
  }
}
