import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // ---------------------------------------------------------------------------
  // Cache helpers
  // Key examples: restaurants:list, restaurant:{id}
  // ---------------------------------------------------------------------------

  async cacheGet<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      this.logger.warn(`cacheGet: failed to parse JSON for key "${key}"`);
      return null;
    }
  }

  async cacheSet(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async cacheDel(key: string): Promise<void> {
    await this.redis.del(key);
  }

  // ---------------------------------------------------------------------------
  // Presence
  // Key: user:{userId}:online  TTL 300s
  // ---------------------------------------------------------------------------

  async setOnline(userId: string, ttlSeconds = 300): Promise<void> {
    await this.redis.set(`user:${userId}:online`, '1', 'EX', ttlSeconds);
  }

  async isOnline(userId: string): Promise<boolean> {
    const value = await this.redis.exists(`user:${userId}:online`);
    return value === 1;
  }

  async setOffline(userId: string): Promise<void> {
    await this.redis.del(`user:${userId}:online`);
  }

  // ---------------------------------------------------------------------------
  // Rate limiting
  // Key: rate:user:{userId}:{endpoint}
  // Returns whether the request is allowed and how many calls remain.
  // ---------------------------------------------------------------------------

  async rateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const redisKey = `rate:${key}`;
    const current = await this.redis.incr(redisKey);
    if (current === 1) {
      // First increment — set expiry for the window
      await this.redis.expire(redisKey, windowSeconds);
    }
    const allowed = current <= limit;
    const remaining = Math.max(0, limit - current);
    return { allowed, remaining };
  }

  // ---------------------------------------------------------------------------
  // Driver state
  // Key: driver:{driverId}:state
  // ---------------------------------------------------------------------------

  async setDriverState(
    driverId: string,
    state: 'available' | 'busy' | 'offline',
  ): Promise<void> {
    await this.redis.set(`driver:${driverId}:state`, state);
  }

  async getDriverState(driverId: string): Promise<string | null> {
    return this.redis.get(`driver:${driverId}:state`);
  }

  // ---------------------------------------------------------------------------
  // GEO — driver matching
  // Global key: drivers:geo
  // ---------------------------------------------------------------------------

  async geoAdd(
    key: string,
    longitude: number,
    latitude: number,
    member: string,
  ): Promise<void> {
    await this.redis.geoadd(key, longitude, latitude, member);
  }

  async geoSearch(
    key: string,
    longitude: number,
    latitude: number,
    radiusKm: number,
  ): Promise<string[]> {
    const results = await this.redis.call(
      'GEOSEARCH',
      key,
      'FROMLONLAT',
      longitude,
      latitude,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'COUNT',
      '10',
    );
    return (results as string[]) ?? [];
  }

  async geoSearchWithDist(
    key: string,
    longitude: number,
    latitude: number,
    radiusKm: number,
  ): Promise<Array<{ member: string; distanceKm: number }>> {
    // Returns [[member, distKm], ...] when WITHDIST is used
    const results = await this.redis.call(
      'GEOSEARCH',
      key,
      'FROMLONLAT',
      longitude,
      latitude,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'COUNT',
      '10',
      'WITHDIST',
    );
    if (!results) return [];
    return (results as [string, string][]).map(([member, dist]) => ({
      member,
      distanceKm: parseFloat(dist),
    }));
  }

  async geoRemove(key: string, member: string): Promise<void> {
    await this.redis.zrem(key, member);
  }

  // ---------------------------------------------------------------------------
  // Order location tracking
  // Key: order:{orderId}:location  TTL 3600s
  // ---------------------------------------------------------------------------

  async setOrderLocation(
    orderId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    await this.redis.set(
      `order:${orderId}:location`,
      JSON.stringify({ lat, lng }),
      'EX',
      3600,
    );
  }

  async getOrderLocation(
    orderId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const value = await this.redis.get(`order:${orderId}:location`);
    if (value === null) return null;
    try {
      return JSON.parse(value) as { lat: number; lng: number };
    } catch {
      this.logger.warn(
        `getOrderLocation: failed to parse JSON for order "${orderId}"`,
      );
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Distributed locks
  // Key: lock:{key}
  // Uses SET NX PX to prevent deadlocks in case of crash.
  // ---------------------------------------------------------------------------

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    // SET lock:{key} 1 PX ttlMs NX — only sets if not already present
    const result = await this.redis.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.redis.del(`lock:${key}`);
  }

  // ---------------------------------------------------------------------------
  // Pipeline — batch multiple commands in a single round-trip
  // ---------------------------------------------------------------------------

  async pipeline(
    fn: (pipeline: ReturnType<Redis['pipeline']>) => void,
  ): Promise<unknown[]> {
    const pipe = this.redis.pipeline();
    fn(pipe);
    const results = await pipe.exec();
    if (!results) return [];
    return results.map(([err, value]) => {
      if (err) throw err;
      return value;
    });
  }
}
