---
name: e12-tests
description: Etapa 12 — implementa testes unitários para services críticos e testes de integração (e2e) para os fluxos principais de pedido, pagamento e entrega. Depende da E11.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 12 — Testes**.

## Pré-requisito
PRs das E1 a E11 mergeados na `main`.

## Dependências a instalar
```bash
npm install -D @nestjs/testing supertest @types/supertest
```

## O que você deve criar

### Helper de mock de repository

`src/common/test/mock-repository.helper.ts`:
```typescript
export const createMockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  findBy: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn(),
    getMany: jest.fn(),
    getOne: jest.fn(),
    getManyAndCount: jest.fn(),
  })),
});
```

---

### Testes Unitários

#### `src/modules/order/order.service.spec.ts`

Cobrir:
1. `create` — calcula total correto com múltiplos items
2. `create` — falha com `BadRequestException` se restaurante fechado
3. `create` — falha com `NotFoundException` se restaurante não existe
4. `create` — falha com `BadRequestException` se produto não pertence ao restaurante
5. `create` — opção obrigatória não fornecida → `BadRequestException`
6. `create` — priceModifier aplicado corretamente ao subtotal
7. `updateStatus` — transição `pending → confirmed` por restaurant_owner funciona
8. `updateStatus` — transição inválida (`pending → delivered`) → `BadRequestException`
9. `updateStatus` — role errada para transição → `ForbiddenException`
10. `cancel` — cancela se pending; rejeita se outro status

```typescript
describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useValue: createMockRepository() },
        { provide: getRepositoryToken(OrderItem), useValue: createMockRepository() },
        { provide: getRepositoryToken(OrderItemOption), useValue: createMockRepository() },
        { provide: RestaurantService, useValue: { findOne: jest.fn(), findProducts: jest.fn() } },
        { provide: RedisService, useValue: { cacheGet: jest.fn(), cacheSet: jest.fn() } },
        { provide: EventsService, useValue: { emitOrderUpdate: jest.fn(), emitNewOrder: jest.fn() } },
        { provide: NotificationsProducer, useValue: { enqueueOrderStatusChange: jest.fn() } },
      ],
    }).compile();
    service = module.get(OrderService);
  });

  // casos de teste aqui
});
```

---

#### `src/modules/delivery/matching.service.spec.ts`

Cobrir:
1. Retorna driver com maior score (distância + rating)
2. Aumenta raio quando nenhum driver encontrado no raio inicial
3. Retorna `null` após MAX_RADIUS sem drivers disponíveis
4. `assignDriver` — lança `ConflictException` se lock já adquirido
5. `assignDriver` — libera lock no `finally` mesmo se exceção

---

#### `src/modules/payment/payment.service.spec.ts`

Cobrir:
1. `initiate` — cria payment para pedido `pending`
2. `initiate` — lança `BadRequestException` se pedido não está `pending`
3. `initiate` — lança `ConflictException` se já existe payment para o pedido
4. `confirm` — confirma e chama `OrderService.updateStatus`
5. `fail` — marca como `failed` sem afetar status do pedido

---

#### `src/modules/restaurant/product-option.service.spec.ts`

Cobrir:
1. `findGroupsByProduct` — retorna do cache se disponível
2. `findGroupsByProduct` — popula cache no miss
3. `createGroup` — invalida cache após criar
4. `deleteGroup` — invalida cache após deletar
5. `createGroup` — lança `ForbiddenException` se produto não pertence ao restaurante

---

### Testes de Integração (e2e)

**Configuração:**

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

Script no `package.json`:
```json
"test:e2e": "dotenv -e .env.test -- jest --config ./test/jest-e2e.json --runInBand"
```

---

#### `test/order-flow.e2e-spec.ts` — Fluxo completo de pedido

```typescript
describe('Order Flow (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let ownerToken: string;
  let driverToken: string;
  let restaurantId: string;
  let productId: string;
  let orderId: string;

  beforeAll(async () => {
    // Inicializar app, registrar customer/owner/driver
    // Criar restaurante e produto
    // Rodar migrations no banco de teste
  });

  afterAll(async () => {
    await app.close();
    // Limpar banco de teste
  });

  it('customer creates order', () => { /* POST /api/v1/orders */ });
  it('owner confirms order',   () => { /* PATCH /api/v1/orders/:id/status → confirmed */ });
  it('owner marks preparing',  () => { /* PATCH → preparing */ });
  it('owner marks ready',      () => { /* PATCH → ready */ });
  it('driver picks up',        () => { /* PATCH → picked_up */ });
  it('driver delivers',        () => { /* PATCH → delivered */ });
  it('invalid transition returns 400', () => { /* pending → delivered direto */ });
  it('wrong role returns 403',  () => { /* customer tenta confirmar */ });
});
```

---

#### `test/payment-flow.e2e-spec.ts` — Fluxo de pagamento

```typescript
describe('Payment Flow (e2e)', () => {
  it('customer initiates payment');     // POST /api/v1/payments
  it('confirm payment moves order to confirmed');  // POST /api/v1/payments/:id/confirm
  it('cannot create second payment for same order'); // 409 Conflict
  it('fail payment keeps order pending');
});
```

---

#### `test/restaurant-search.e2e-spec.ts` — Busca de restaurantes

```typescript
describe('Restaurant Search (e2e)', () => {
  it('GET /restaurants/nearby returns sorted by distance');
  it('GET /restaurants/search with onlyOpen filter');
  it('GET /restaurants/featured returns isFeatured=true only');
  it('POST /restaurants/:id/reviews requires DELIVERED order');
  it('duplicate review returns 409');
});
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e12-tests
git add src/**/*.spec.ts test/ src/common/test
git commit -m "feat: add unit tests for services and e2e tests for order, payment and restaurant flows"
git push origin feat/e12-tests
gh pr create \
  --title "feat: E12 - Unit and integration tests" \
  --base main \
  --body "## O que foi feito
- Mock repository helper reutilizável
- Unitários: OrderService (10 casos), MatchingService (5), PaymentService (5), ProductOptionService (5)
- E2E: fluxo completo de pedido (8 etapas de status)
- E2E: fluxo de pagamento (4 casos)
- E2E: busca de restaurantes e avaliações
- Banco de teste separado (delivery_test)

## Depende de
PR E11 mergeado

## Como rodar
\`\`\`bash
npm run test        # unitários
npm run test:e2e   # integração (precisa do postgres e redis rodando)
\`\`\`"
```

## Regras
- Unitários: **mockar todas** as dependências externas (Redis, banco, filas, Socket.IO)
- E2E: usar banco real `delivery_test` — nunca o banco de dev/prod
- Cada suite deve limpar seu estado no `beforeAll`/`afterAll`
- Cobrir **casos de erro** tanto quanto o happy path
- E2E deve rodar `--runInBand` para evitar race conditions entre suites
