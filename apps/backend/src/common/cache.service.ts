import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Unified cache service: Redis when REDIS_URL is available, in-memory LRU Map
 * as a graceful fallback for local dev or when Redis is unreachable.
 * Keys are namespaced (e.g. "product:barcode:123456") with configurable TTL.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private mem = new Map<string, { value: string; expiresAt: number }>();
  private memMax = 2000;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url && process.env.NODE_ENV === 'production') {
      // Production REQUIRES managed Redis (Render) — the in-memory fallback
      // below is dev-only. Loud warning (not a crash: the app still serves).
      this.logger.warn('REDIS_URL is not set in production — using in-memory cache fallback; barcode caching and shared state will not survive restarts');
    }
    if (url) {
      try {
        this.redis = new Redis(url, {
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          lazyConnect: true,
          retryStrategy(times) {
            return times > 2 ? null : Math.min(times * 200, 1000);
          },
        });
        this.redis.connect().catch(() => {
          this.logger.warn('Redis unreachable — falling back to in-memory cache');
          this.redis = null;
        });
        this.redis.on('error', () => {
          // Silence repeated errors after initial failure
        });
      } catch {
        this.redis = null;
      }
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
    }
  }

  /** Get a cached value by key. Returns null on miss. */
  async get(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        return await this.redis.get(key);
      } catch {
        // Redis error — fall through to memory
      }
    }
    const hit = this.mem.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.mem.delete(key);
      return null;
    }
    return hit.value;
  }

  /** Set a value with TTL in seconds. */
  async set(key: string, value: string, ttlSeconds = 30): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.set(key, value, 'EX', ttlSeconds);
        return;
      } catch {
        // fall through to memory
      }
    }
    // Evict oldest entries when memory cache is full
    if (this.mem.size >= this.memMax) {
      const oldest = this.mem.keys().next().value;
      if (oldest) this.mem.delete(oldest);
    }
    this.mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  /** Delete a single key. */
  async del(key: string): Promise<void> {
    if (this.redis) {
      try { await this.redis.del(key); } catch { /* ignore */ }
    }
    this.mem.delete(key);
  }

  /** Delete all keys matching a prefix pattern (e.g. "product:barcode:*"). */
  async invalidatePattern(pattern: string): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length) await this.redis.del(...keys);
      } catch { /* ignore */ }
    }
    // Memory: iterate and delete matching keys
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const k of this.mem.keys()) {
      if (regex.test(k)) this.mem.delete(k);
    }
  }

  /** Convenience: invalidate all cached entries for a specific product. */
  async invalidateProduct(productId: string, barcode?: string | null): Promise<void> {
    await this.del(`product:id:${productId}`);
    if (barcode) await this.del(`product:barcode:${barcode}`);
    // Also clear any pattern-matched keys
    await this.invalidatePattern(`product:barcode:${barcode || '*'}:*`);
  }
}
