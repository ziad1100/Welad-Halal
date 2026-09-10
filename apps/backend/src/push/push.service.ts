import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as webpush from 'web-push';

/**
 * §7 — PWA Web Push. Works only when VAPID keys are configured
 * (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT in the environment);
 * otherwise subscription is stored and delivery silently skipped, so local
 * dev with no keys never throws.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private ready = false;

  constructor(private prisma: PrismaService) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:owner@weladhalal.example';
    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv);
      this.ready = true;
    }
  }

  isConfigured() {
    return this.ready;
  }

  async subscribe(userId: string, body: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      throw new Error('بيانات الاشتراك غير مكتملة');
    }
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint: body.endpoint } });
    if (existing) {
      return this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { userId, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: userAgent || null },
      });
    }
    return this.prisma.pushSubscription.create({
      data: { userId, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: userAgent || null },
    });
  }

  async unsubscribe(endpoint: string) {
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint } });
    if (!existing) return { ok: false };
    await this.prisma.pushSubscription.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  async sendToManagers(title: string, body: string, data?: Record<string, unknown>) {
    if (!this.ready) return { sent: 0, skipped: true };
    // Only managers & owners receive push (owner included via permissionLevel >= 50).
    const subs = await this.prisma.pushSubscription.findMany({
      where: { user: { OR: [{ permissionLevel: 50 }, { permissionLevel: 100 }] } },
      take: 100,
    });
    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title, body, data: data || {} }),
          );
          sent++;
        } catch (e: any) {
          // 404/410 → subscription expired, drop it.
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            this.logger.debug(`push failed: ${e?.message}`);
          }
        }
      }),
    );
    return { sent, skipped: false };
  }
}
