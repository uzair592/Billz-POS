import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;
  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (this.redis.status === 'wait') await this.redis.connect();
    const value = await this.redis.incr(`rate:${key}`);
    if (value === 1) await this.redis.expire(`rate:${key}`, windowSeconds);
    return value <= limit;
  }

  async onModuleDestroy() { if (this.redis.status !== 'end') await this.redis.quit(); }
}
