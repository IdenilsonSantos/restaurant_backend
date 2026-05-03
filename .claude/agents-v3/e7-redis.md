---
name: e7-redis
description: Etapa 7 — integração com Redis via ioredis: cache, presença, rate limit, estado do driver, GEO, tracking e locks distribuídos. Pode rodar em paralelo com E5 e E6. Depende da E1.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 7 — Redis (Integração Avançada).

## Pré-requisito
PR da E1 mergeado. **Pode rodar em paralelo com E5 e E6.**

## Dependências
```bash
npm install ioredis
npm install -D @types/ioredis
```

## RedisModule (`src/modules/redis/`)

Módulo **@Global()** — qualquer módulo pode injetar `RedisService` sem re-importar.

```typescript
export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) => new Redis(config.get<string>('REDIS_URL')),
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
```

Registrar no `AppModule`.

---

## RedisService — métodos

Injetar `@Inject(REDIS_CLIENT) private readonly redis: Redis`.

### Cache genérico
- `cacheGet<T>(key)` → `GET key`, JSON.parse, null se não existe
- `cacheSet(key, value, ttlSeconds)` → `SET key JSON.stringify(value) EX ttl`
- `cacheDel(key)` → `DEL key`

Chaves de cache: `restaurant:{id}` TTL 300s | `restaurant:{id}:status` sem TTL | `product:{id}:option-groups` TTL 300s

### Presença de usuário
- `setOnline(userId, ttl=300)` → `SET user:{userId}:online 1 EX ttl`
- `isOnline(userId)` → `EXISTS user:{userId}:online → boolean`
- `setOffline(userId)` → `DEL user:{userId}:online`

### Rate Limit
- `rateLimit(key, limit, windowSeconds)` → `INCR key`; se count===1: `EXPIRE key windowSeconds`; retorna `{ allowed: count <= limit, remaining: max(0, limit-count) }`

### Estado do Driver
- `setDriverState(driverId, state: 'available'|'busy'|'offline')` → `SET driver:{driverId}:state {state}`
- `getDriverState(driverId)` → `GET driver:{driverId}:state`

### Estado do Restaurante
- `setRestaurantOpen(restaurantId, isOpen)` → `SET restaurant:{id}:status 'open'|'closed'` (sem TTL)
- `getRestaurantStatus(restaurantId)` → true se 'open', false se 'closed', null se chave inexistente

> Sem TTL — atualizada explicitamente pelo `setStatus()`. Diferente do cache `restaurant:{id}` (TTL 300s), é fonte de verdade para rejeição rápida de novos pedidos.

### GEO (matching)
- `geoAdd(key, longitude, latitude, member)` → `GEOADD key lon lat member`
- `geoSearch(key, longitude, latitude, radiusKm)` → `GEOSEARCH ... BYRADIUS radius km ASC COUNT 20`
- `geoRemove(key, member)` → `ZREM key member`

Chave global: `drivers:geo`. Atenção: **longitude antes de latitude** (convenção Redis/GeoJSON).

### Tracking de pedido
- `setOrderLocation(orderId, lat, lng)` → `SET order:{orderId}:location JSON.stringify({lat,lng}) EX 3600`
- `getOrderLocation(orderId)` → JSON.parse ou null

### Locks distribuídos
- `acquireLock(key, ttlMs)` → `SET lock:{key} 1 NX PX ttlMs → boolean`
- `releaseLock(key)` → `DEL lock:{key}`

### Pipeline
- `pipeline(fn)` → `const p = redis.pipeline(); fn(p); return p.exec()`

---

## RateLimitGuard e Decorator

`src/common/decorators/rate-limit.decorator.ts`:
```typescript
export const RateLimit = (limit: number, windowSeconds: number) =>
  SetMetadata('rateLimit', { limit, windowSeconds });
```

`src/common/guards/rate-limit.guard.ts`:
```typescript
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private redisService: RedisService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<{ limit: number; windowSeconds: number }>(
      'rateLimit', [context.getHandler(), context.getClass()],
    );
    if (!config) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub ?? request.ip;
    const endpoint = `${request.method}:${request.route?.path ?? request.url}`;
    const key = `rate:user:${userId}:${endpoint}`;

    const { allowed } = await this.redisService.rateLimit(key, config.limit, config.windowSeconds);
    if (!allowed) throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    return true;
  }
}
```

## Commit
```bash
git checkout -b feat/e7-redis-integration
git add src/modules/redis src/common/guards/rate-limit.guard.ts src/common/decorators/rate-limit.decorator.ts
git commit -m "feat: add Redis service with cache, geo, locks, rate-limit and presence"
```

## Regras
- Locks **sempre** com TTL — nunca sem expiração (evita deadlock em crash)
- GEO: longitude primeiro, depois latitude
- `@Global()` — nunca re-importar RedisModule em feature modules
