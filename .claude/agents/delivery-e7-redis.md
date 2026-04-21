---
name: delivery-e7-redis
description: Etapa 7 do sistema de delivery — integração avançada com Redis: cache, presença, rate limit, estado do driver, GEO, pipeline e locks distribuídos. Depende da Etapa 1. Pode rodar em paralelo com E5 e E6.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 7 — Redis (Integração Avançada)** do sistema de delivery.

## Pré-requisito
PR da Etapa 1 mergeado. Esta etapa pode rodar em paralelo com E5 e E6.

## Dependências a instalar
```bash
npm install ioredis
npm install -D @types/ioredis
```

## O que você deve criar

### RedisModule (`src/modules/redis/`)

**redis.module.ts** — módulo global que provê o cliente Redis:
```typescript
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) => {
        return new Redis(config.get<string>('REDIS_URL'));
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
```

---

### RedisService (`src/modules/redis/redis.service.ts`)

Injetar o `REDIS_CLIENT` e implementar todos os helpers:

**Cache:**
```typescript
async cacheGet<T>(key: string): Promise<T | null>
async cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void>
async cacheDel(key: string): Promise<void>
// Uso: restaurants:list, restaurant:{id}
```

**Presença:**
```typescript
async setOnline(userId: string, ttlSeconds = 300): Promise<void>
// SET user:{userId}:online 1 EX ttl
async isOnline(userId: string): Promise<boolean>
async setOffline(userId: string): Promise<void>
```

**Rate Limit:**
```typescript
async rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }>
// Usa INCR + EXPIRE
// Chave: rate:user:{userId}:endpoint
```

**Estado do Driver:**
```typescript
async setDriverState(driverId: string, state: 'available' | 'busy' | 'offline'): Promise<void>
// SET driver:{driverId}:state {state}
async getDriverState(driverId: string): Promise<string | null>
```

**GEO (para Matching):**
```typescript
async geoAdd(key: string, longitude: number, latitude: number, member: string): Promise<void>
// GEOADD drivers:geo lon lat driverId
async geoSearch(key: string, longitude: number, latitude: number, radiusKm: number): Promise<string[]>
// GEOSEARCH ... BYRADIUS {radius} km ASC COUNT 10
async geoRemove(key: string, member: string): Promise<void>
```

**Tracking de pedido:**
```typescript
async setOrderLocation(orderId: string, lat: number, lng: number): Promise<void>
// SET order:{orderId}:location {lat,lng} EX 3600
async getOrderLocation(orderId: string): Promise<{ lat: number; lng: number } | null>
```

**Locks Distribuídos:**
```typescript
async acquireLock(key: string, ttlMs: number): Promise<boolean>
// SET lock:{key} 1 NX PX ttlMs
async releaseLock(key: string): Promise<void>
// DEL lock:{key}
```

**Pipeline:**
```typescript
async pipeline(fn: (pipeline: ReturnType<Redis['pipeline']>) => void): Promise<unknown[]>
// Executa múltiplos comandos em batch
```

---

### RateLimitGuard (opcional mas recomendado)
`src/common/guards/rate-limit.guard.ts`:
```typescript
// Guard que usa RedisService.rateLimit para proteger endpoints
// Configurável via decorator @RateLimit(limit, windowSeconds)
```

`src/common/decorators/rate-limit.decorator.ts`:
```typescript
export const RateLimit = (limit: number, windowSeconds: number) =>
  SetMetadata('rateLimit', { limit, windowSeconds });
```

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e7-redis-integration`
3. Criar todos os arquivos
4. `git add src/modules/redis src/common/guards/rate-limit.guard.ts src/common/decorators/rate-limit.decorator.ts`
5. `git commit -m "feat: add Redis service with cache, geo, locks, rate-limit and presence"`
6. `git push origin feat/e7-redis-integration`
7. `gh pr create --title "feat: E7 - Redis advanced integration" --base main --body "## O que foi feito\n- RedisModule global com ioredis\n- Cache helpers (get/set/del)\n- Presença de usuários\n- Rate limiting por usuário\n- Estado do driver\n- GEO para matching de entregadores\n- Tracking de localização de pedidos\n- Locks distribuídos (SET NX)\n- Pipeline para batch de comandos\n\n## Depende de\nPR E1 mergeado\n\n## Pode rodar em paralelo com\nE5 e E6"`

## Regras
- RedisModule deve ser @Global() para ser injetado em qualquer módulo sem re-importar
- Sempre usar TTL em chaves de cache e estado
- Locks devem ter TTL para evitar deadlock em caso de crash
- GEO usar a chave global `drivers:geo` para todos os drivers
