---
name: e12-tests
description: Etapa 12 — testes unitários para services críticos e testes de integração (e2e) para pedido, pagamento e restaurante. Depende da E11.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 12 — Testes.

## Pré-requisito
PRs E1–E11 mergeados.

## Dependências
```bash
npm install -D @nestjs/testing supertest @types/supertest
```

---

## Helper de mock

```typescript
// src/common/test/mock-repository.helper.ts
export const createMockRepository = () => ({
  find: jest.fn(), findOne: jest.fn(), findOneBy: jest.fn(), findBy: jest.fn(),
  save: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
  remove: jest.fn(), count: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(), leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(),
    execute: jest.fn(), getMany: jest.fn(), getOne: jest.fn(), getManyAndCount: jest.fn(),
  })),
});
```

---

## Testes unitários

### `src/modules/order/order.service.spec.ts`

Setup: mockar `Order`, `OrderItem`, `OrderItemOption` repos + `RestaurantService` + `RedisService` + `EventsService` + `NotificationsProducer`.

Casos:
1. `create` — calcula total correto com múltiplos items
2. `create` — BadRequestException se restaurante fechado
3. `create` — NotFoundException se restaurante não existe
4. `create` — BadRequestException se produto não pertence ao restaurante
5. `create` — opção obrigatória não fornecida → BadRequestException
6. `create` — priceModifier aplicado ao subtotal
7. `updateStatus` — `pending → confirmed` por restaurant_owner
8. `updateStatus` — transição inválida → BadRequestException
9. `updateStatus` — role errada → ForbiddenException
10. `cancel` — cancela se pending; rejeita se outro status

### `src/modules/delivery/matching.service.spec.ts`

Casos:
1. Retorna driver com maior score (distância + rating)
2. Aumenta raio quando nenhum driver no raio inicial
3. Retorna null após MAX_RADIUS sem drivers disponíveis
4. `assignDriver` — ConflictException se lock já adquirido
5. `assignDriver` — libera lock no finally mesmo com exceção

### `src/modules/payment/payment.service.spec.ts`

Casos:
1. `initiate` — cria payment para pedido `pending`
2. `initiate` — BadRequestException se pedido não está `pending`
3. `initiate` — ConflictException se já existe payment para o pedido
4. `confirm` — confirma e chama `OrderService.updateStatus`
5. `fail` — marca como `failed` sem afetar status do pedido

### `src/modules/restaurant/product-option.service.spec.ts`

Casos:
1. `findGroupsByProduct` — retorna do cache se disponível
2. `findGroupsByProduct` — popula cache no miss
3. `createGroup` — invalida cache após criar
4. `deleteGroup` — invalida cache após deletar
5. `createGroup` — ForbiddenException se produto não pertence ao restaurante

---

## Testes e2e

### Configuração

`test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

`.env.test`:
```
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/delivery_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=test-secret-for-integration
JWT_EXPIRES_IN=1d
PORT=3001
CORS_ORIGIN=http://localhost:3001
```

`package.json`: `"test:e2e": "dotenv -e .env.test -- jest --config ./test/jest-e2e.json --runInBand"`

### `test/order-flow.e2e-spec.ts`

Setup: criar customer, owner, driver, restaurante, produto. Casos:
1. Customer cria pedido → 201
2. Owner confirma → 200 confirmed
3. Owner preparing → 200
4. Owner ready → 200
5. Driver picks_up → 200
6. Driver delivered → 200
7. Transição inválida (pending → delivered) → 400
8. Role errada (customer tenta confirmar) → 403

### `test/payment-flow.e2e-spec.ts`

1. Customer inicia pagamento → 201 pending
2. Confirmar payment → pedido vai para confirmed
3. Segundo pagamento no mesmo pedido → 409
4. Falhar payment → pedido permanece pending

### `test/restaurant-search.e2e-spec.ts`

1. `GET /restaurants/nearby` retorna ordenado por distância
2. `GET /restaurants/search?onlyOpen=true` filtra fechados
3. `GET /restaurants/featured` retorna apenas `isFeatured=true`
4. Review exige pedido DELIVERED
5. Review duplicada → 409

---

## Commit
```bash
git checkout -b feat/e12-tests
git add src/**/*.spec.ts test/ src/common/test
git commit -m "feat: add unit tests for services and e2e tests for order, payment and restaurant flows"
```

## Regras
- Unitários: mockar **todas** as dependências externas
- E2E: banco real `delivery_test` — nunca dev/prod
- `--runInBand` nos e2e para evitar race conditions
- Cobrir casos de erro tanto quanto o happy path
