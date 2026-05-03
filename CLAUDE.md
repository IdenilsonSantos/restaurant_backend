# CLAUDE.md

NestJS backend — sistema de delivery para restaurantes.

**Stack:** Node.js 20 · NestJS · TypeORM · PostgreSQL · Redis (ioredis) · BullMQ · Socket.IO · Passport JWT · Winston · @nestjs/schedule

**Regras de codificação:** [`.claude/RULES.md`](.claude/RULES.md)
**Referência completa do sistema:** [`.claude/agents-v2/SYSTEM-OVERVIEW.md`](.claude/agents-v2/SYSTEM-OVERVIEW.md)
**Agentes de implementação (v3):** [`.claude/agents-v3/README.md`](.claude/agents-v3/README.md)

---

## Comandos

```bash
# Dev
npm run start:dev
docker compose up

# Build
npm run build && npm run start:prod

# Migrations
npm run migration:generate -- src/database/migrations/<Name>
npm run migration:run
npm run migration:revert

# Testes
npm run test
npm run test:e2e
npm run test -- --testPathPattern=<module>

# Qualidade
npm run lint
npm run format:check
```

---

## Módulos

| Módulo | Caminho | Responsabilidade |
|---|---|---|
| AuthModule | `src/modules/auth/` | JWT, forgot/reset password, email |
| UserModule | `src/modules/user/` | CRUD, avatar |
| RestaurantModule | `src/modules/restaurant/` | CRUD, busca Haversine, avaliações, open/close, cron |
| DriverModule | `src/modules/driver/` | Perfil, localização, disponibilidade |
| OrderModule | `src/modules/order/` | Criação, state machine, opções de produto |
| PaymentModule | `src/modules/payment/` | Pagamentos, confirmação |
| DeliveryModule | `src/modules/delivery/` | Lifecycle, GEO matching, tracking |
| RedisModule | `src/modules/redis/` | **@Global** — cache, GEO, locks, rate limit |
| QueueModule | `src/modules/queue/` | BullMQ: delivery-matching, notifications |
| EventsModule | `src/modules/events/` | **@Global** — Socket.IO, rooms, eventos |
| CategoryModule | `src/modules/category/` | Tags (Popular, Fast Delivery…) |
| LocationModule | `src/modules/location/` | Endereços estruturados, geocodificação |
| StorageModule | `src/modules/storage/` | **@Global** — upload imagens (local / S3) |
| HealthModule | `src/modules/health/` | `GET /health` |

---

## Prefixo global

`app.setGlobalPrefix('api/v1')` — todos os endpoints em `/api/v1/...`

> O código atual usa `'api'` (sem `/v1`). Corrigir na E11.

---

## Variáveis de ambiente

```
NODE_ENV, PORT, APP_URL, CORS_ORIGIN
DATABASE_URL
REDIS_URL
JWT_SECRET (min 32 chars), JWT_EXPIRES_IN
MAIL_HOST, MAIL_PORT, MAIL_SECURE, MAIL_USER, MAIL_PASS, MAIL_FROM
STORAGE_PROVIDER (local|s3), STORAGE_BUCKET, STORAGE_REGION,
STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, STORAGE_PUBLIC_URL, STORAGE_ENDPOINT
```

Validadas pelo Joi schema em `src/config/env.validation.ts` — app não sobe com variável faltando.

---

## Redis — chaves

```
restaurant:{id}              TTL 300s    objeto do restaurante
restaurant:{id}:status       sem TTL     isOpen — gate rápido
product:{id}:option-groups   TTL 300s    grupos de opções
product:{id}:detail          TTL 300s    detalhe com totalMinutes
user:{id}:online             TTL 300s    presença
driver:{id}:state            sem TTL     available | busy | offline
drivers:geo                  sem TTL     GEO set global
order:{id}:location          TTL 3600s   última posição do driver
lock:{key}                   TTL 30000ms lock distribuído
rate:user:{id}:{endpoint}    windowSecs  rate limit
geocode:{base64}             TTL 86400s  geocodificação
tags:all                     TTL 3600s   listagem de tags
```

---

## Agentes (cadeia de implementação)

```
E1 → E2 → E-Storage → E3 → E4 → E5 ←── E7 (paralelo)
                                 ↓
                                E6 → E8 → E9 → E10 → E11 → E12 → E13 → E14

Extras: E-Products · E-Categories · E-Location  (após E5)
```

| Agente | Arquivo |
|---|---|
| E1 Setup | `.claude/agents-v2/e1-setup.md` |
| E2 Database | `.claude/agents-v2/e2-database.md` |
| E-Storage | `.claude/agents-v2/e-storage.md` |
| E3 Restaurant/User/Driver | `.claude/agents-v2/e3-restaurant.md` |
| E4 Auth | `.claude/agents-v2/e4-auth.md` |
| E5 Orders + Options | `.claude/agents-v2/e5-orders.md` |
| E6 Payment | `.claude/agents-v2/e6-payment.md` |
| E7 Redis | `.claude/agents-v2/e7-redis.md` |
| E8 Delivery + Matching | `.claude/agents-v2/e8-delivery.md` |
| E9 Queues BullMQ | `.claude/agents-v2/e9-queues.md` |
| E10 Realtime + Tracking | `.claude/agents-v2/e10-realtime.md` |
| E11 Observability | `.claude/agents-v2/e11-observability.md` |
| E12 Tests | `.claude/agents-v2/e12-tests.md` |
| E13 Docker Prod | `.claude/agents-v2/e13-docker-prod.md` |
| E14 CI/CD | `.claude/agents-v2/e14-cicd.md` |
| E-Products | `.claude/agents-v2/e-products.md` |
| E-Categories | `.claude/agents-v2/e-categories.md` |
| E-Location | `.claude/agents-v2/e-location.md` |
