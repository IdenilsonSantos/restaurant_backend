# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestJS backend for a restaurant delivery system. Stack: Node.js 20, NestJS, TypeORM + PostgreSQL, Redis (ioredis), BullMQ, Socket.IO, Passport JWT, Winston.

## Commands

```bash
# Development
npm run start:dev          # hot reload via ts-node-dev
docker compose up          # spin up app + postgres + redis

# Build & production
npm run build
npm run start:prod

# Database migrations
npm run migration:generate -- src/database/migrations/<Name>
npm run migration:run
npm run migration:revert

# Tests
npm run test               # unit tests
npm run test:e2e           # integration tests
npm run test -- --testPathPattern=<module>  # single test file

# Lint
npm run lint
```

## Architecture

The project is built in 15 sequential stages, each as a sub-agent in `.claude/agents/`. Stages have strict PR merge dependencies — never work on a stage before its predecessors are merged.

### Module dependency order

```
E1 Setup → E2 Database → E3 Base Modules → E4 Auth → E5 Orders → E6 Payment
                                                                        ↓
E1 → E7 Redis (parallel with E5/E6) → E8 Delivery Matching → E9 BullMQ Queues
                                                                        ↓
                                               E10 WebSocket → E11 Tracking → E12 Observability → E13 Tests → E14 Docker Prod → E15 CI/CD
```

### Module map

| Module | Path | Responsibility |
|---|---|---|
| RestaurantModule | `src/modules/restaurant/` | CRUD for restaurants and products |
| UserModule | `src/modules/user/` | User CRUD; `findByEmail` for AuthModule |
| DriverModule | `src/modules/driver/` | Driver profile, location, availability |
| AuthModule | `src/modules/auth/` | JWT register/login, Passport strategy |
| OrderModule | `src/modules/order/` | Order creation, state machine, pagination |
| DeliveryModule | `src/modules/delivery/` | Delivery lifecycle + driver matching |
| RedisModule | `src/modules/redis/` | Global Redis client (ioredis), all Redis helpers |
| QueueModule | `src/modules/queue/` | BullMQ queues: `delivery-matching`, `notifications` |
| EventsModule | `src/modules/events/` | Socket.IO gateway, rooms, real-time events |
| HealthModule | `src/modules/health/` | Health check endpoint (`GET /health`) |

### Common layer (`src/common/`)

- `guards/` — `JwtAuthGuard`, `RolesGuard`, `WsJwtGuard`, `RateLimitGuard`
- `decorators/` — `@Roles()`, `@CurrentUser()`, `@RateLimit()`
- `filters/` — `GlobalExceptionFilter` (standardised error shape)
- `interceptors/` — `RequestLoggerInterceptor`
- `enums/` — `OrderStatus`, `DeliveryStatus`, `PaymentStatus`
- `dto/` — `PaginationDto`, `PaginatedResult<T>`

### Key design decisions

**Order state machine** — transitions and allowed roles are centralised in `src/modules/order/constants/order-transitions.constant.ts`. Never inline transition logic in the service.

**Product snapshot** — `order_items` stores `productName` and `productPrice` at creation time. Never recalculate totals from current product prices.

**Driver matching** — `MatchingService` searches Redis GEO with expanding radius (3 km → 6 → … → 15). Score = `(1/distance)*0.6 + (rating/5)*0.4`. A distributed lock (`SET NX PX`) must be acquired on the driver before updating the database.

**Redis key schema**
```
user:{id}:online           # presence TTL 300s
driver:{id}:state          # available | busy | offline
drivers:geo                # global GEO set for all drivers
lock:{key}                 # distributed lock (SET NX PX)
rate:user:{id}:{endpoint}  # rate limit counter
order:{id}:location        # last known position TTL 3600s
restaurant:{id}            # cached restaurant TTL configurable
```

**WebSocket rooms** — always emit to specific rooms, never broadcast globally.
```
customer:{id}   → order:update
restaurant:{id} → order:new, order:update
driver:{id}     → delivery:request
order:{id}      → order:update, location:update
```

**Queue retry strategy** — BullMQ handles system errors (Redis down) with exponential backoff (3 attempts). "No driver found" is a business retry: the processor re-enqueues with a growing delay (attempt × 5 s), up to 5 attempts, then notifies the restaurant.

### Global API prefix

All REST endpoints are prefixed with `/api/v1` (set in `main.ts`).

### Environment variables

Required in `.env` (see `.env.example`):
```
NODE_ENV, PORT, DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_EXPIRES_IN
```

Validated at startup with a Joi schema in `src/config/env.validation.ts`. The app will not start if any required variable is missing.

### Sub-agents

The agents in `.claude/agents/` are self-contained stage executors. When using them, pass the correct stage number. Each agent creates its own feature branch and PR following the pattern `feat/e{N}-<slug>`.
