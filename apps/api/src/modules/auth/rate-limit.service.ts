import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly fallback = new Map<string, { count: number; expiresAt: number }>();
  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      const value = await this.redis.incr(`rate:${key}`);
      if (value === 1) await this.redis.expire(`rate:${key}`, windowSeconds);
      return value <= limit;
    } catch {
      const now = Date.now(); const current = this.fallback.get(key);
      if (!current || current.expiresAt <= now) { this.fallback.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 }); return true; }
      current.count += 1; return current.count <= limit;
    }
  }

  async onModuleDestroy() { if (this.redis.status !== 'end') await this.redis.quit(); }
}
