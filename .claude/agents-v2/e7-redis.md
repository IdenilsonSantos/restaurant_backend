---
name: e7-redis
description: Etapa 7 — integração avançada com Redis via ioredis: cache, presença, rate limit, estado do driver, GEO, tracking de pedido, pipeline e locks distribuídos. Pode rodar em paralelo com E5 e E6. Depende da E1.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 7 — Redis (Integração Avançada)**.

## Pré-requisito
PR da E1 mergeado. **Pode rodar em paralelo com E5 e E6.**

## Dependências a instalar
```bash
npm install ioredis
npm install -D @types/ioredis
```

## O que você deve criar

### RedisModule (`src/modules/redis/`)

`redis.constants.ts`:
```typescript
export const REDIS_CLIENT = 'REDIS_CLIENT';
```

`redis.module.ts` — módulo **@Global()**:
```typescript
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

---

### RedisService (`src/modules/redis/redis.service.ts`)

Injetar `@Inject(REDIS_CLIENT) private readonly redis: Redis`.

Implementar todos os helpers abaixo com tipagem correta:

#### Cache genérico
```typescript
async cacheGet<T>(key: string): Promise<T | null>
// GET key → JSON.parse → null se não existe

async cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void>
// SET key JSON.stringify(value) EX ttlSeconds

async cacheDel(key: string): Promise<void>
// DEL key
```

Chaves usadas no projeto:
- `restaurant:{id}` TTL 300s — cache de restaurante no OrderService
- `restaurant:{id}:status` sem TTL — estado aberto/fechado (fonte de verdade para rejeição rápida)
- `product:{id}:option-groups` TTL 300s — cache de grupos de opções

#### Presença de usuário
```typescript
async setOnline(userId: string, ttlSeconds = 300): Promise<void>
// SET user:{userId}:online 1 EX ttl

async isOnline(userId: string): Promise<boolean>
// EXISTS user:{userId}:online → boolean

async setOffline(userId: string): Promise<void>
// DEL user:{userId}:online
```

#### Rate Limit
```typescript
async rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }>
// INCR key → se count === 1: EXPIRE key windowSeconds
// allowed = count <= limit; remaining = Math.max(0, limit - count)
```
Chave padrão: `rate:user:{userId}:{endpoint}`

#### Estado do Driver
```typescript
async setDriverState(driverId: string, state: 'available' | 'busy' | 'offline'): Promise<void>
// SET driver:{driverId}:state {state}

async getDriverState(driverId: string): Promise<string | null>
// GET driver:{driverId}:state
```

#### Estado do Restaurante (aberto/fechado)
```typescript
async setRestaurantOpen(restaurantId: string, isOpen: boolean): Promise<void>
// SET restaurant:{restaurantId}:status "open" | "closed"  (sem TTL — persiste até mudança manual)

async getRestaurantStatus(restaurantId: string): Promise<boolean | null>
// GET restaurant:{restaurantId}:status → true se "open", false se "closed", null se não existe
```

> Esta chave **não tem TTL** — ela é atualizada explicitamente pelo `RestaurantService.setStatus()` e reflete a decisão manual do dono. Diferente do cache `restaurant:{id}` (TTL 300s), esta chave é uma fonte de verdade para verificações rápidas de "está aberto?" sem query no banco.
>
> O `OrderService.create()` pode checar `getRestaurantStatus(id)` antes de usar o cache do restaurante — se retornar `false`, rejeitar imediatamente sem nem ler o cache.

#### GEO (matching de entregadores)
```typescript
async geoAdd(key: string, longitude: number, latitude: number, member: string): Promise<void>
// GEOADD key lon lat member

async geoSearch(key: string, longitude: number, latitude: number, radiusKm: number): Promise<string[]>
// GEOSEARCH key FROMMEMBER/FROMLONLAT lon lat BYRADIUS radius km ASC COUNT 20

async geoRemove(key: string, member: string): Promise<void>
// ZREM key member (GEO usa sorted set internamente)
```
Chave global: `drivers:geo`

#### Tracking de pedido
```typescript
async setOrderLocation(orderId: string, lat: number, lng: number): Promise<void>
// SET order:{orderId}:location JSON.stringify({lat,lng}) EX 3600

async getOrderLocation(orderId: string): Promise<{ lat: number; lng: number } | null>
// GET order:{orderId}:location → JSON.parse
```

#### Locks distribuídos
```typescript
async acquireLock(key: string, ttlMs: number): Promise<boolean>
// SET lock:{key} 1 NX PX ttlMs → boolean (true se lock adquirido)

async releaseLock(key: string): Promise<void>
// DEL lock:{key}
```

#### Pipeline (batch de comandos)
```typescript
async pipeline(fn: (p: ReturnType<Redis['pipeline']>) => void): Promise<unknown[]>
// const p = redis.pipeline(); fn(p); return p.exec()
```

---

### RateLimitGuard e Decorator

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

---

## Registrar no AppModule

`src/app.module.ts` deve importar `RedisModule`:
```typescript
imports: [
  // ...
  RedisModule,
]
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e7-redis-integration
git add src/modules/redis src/common/guards/rate-limit.guard.ts src/common/decorators/rate-limit.decorator.ts
git commit -m "feat: add Redis service with cache, geo, locks, rate-limit and presence"
git push origin feat/e7-redis-integration
gh pr create \
  --title "feat: E7 - Redis advanced integration" \
  --base main \
  --body "## O que foi feito
- RedisModule @Global com ioredis
- Cache get/set/del com JSON serialization
- Presença de usuário com TTL
- Rate limiting por usuário (INCR + EXPIRE)
- Estado do driver (available/busy/offline)
- GEO para matching (GEOADD/GEOSEARCH/ZREM)
- Tracking de localização de pedido (TTL 3600s)
- Locks distribuídos (SET NX PX)
- Pipeline para batch
- RateLimitGuard + @RateLimit() decorator

## Pode rodar em paralelo com
E5 e E6"
```

## Regras
- `@Global()` — qualquer módulo pode injetar `RedisService` sem re-importar `RedisModule`
- Sempre usar TTL em chaves de cache e estado — nunca chaves eternas
- Locks SEMPRE com TTL para evitar deadlock em caso de crash
- GEO usa chave global `drivers:geo` para todos os drivers
- Coordenadas GEO: longitude primeiro, depois latitude (convenção Redis/GeoJSON)
