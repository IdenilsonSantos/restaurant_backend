---
name: delivery-e13-tests
description: Etapa 13 do sistema de delivery — implementa testes unitários para services críticos e testes de integração para os fluxos principais de pedido e entrega. Depende da Etapa 12.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 13 — Testes** do sistema de delivery.

## Pré-requisito
PRs das Etapas 1 a 12 mergeados na `main`.

## Dependências a instalar
```bash
npm install -D @nestjs/testing supertest
npm install -D @types/supertest
```

## O que você deve criar

### Testes Unitários

#### OrderService (`src/modules/order/order.service.spec.ts`)

Testar:
1. `create` — calcula total corretamente com múltiplos itens
2. `create` — falha se restaurante não existe (`NotFoundException`)
3. `create` — falha se restaurante fechado (`BadRequestException`)
4. `create` — falha se produto não pertence ao restaurante
5. `updateStatus` — transição válida funciona
6. `updateStatus` — transição inválida lança `BadRequestException`
7. `updateStatus` — role errada lança `ForbiddenException`

```typescript
describe('OrderService', () => {
  let service: OrderService;
  let orderRepo: jest.Mocked<Repository<Order>>;
  let restaurantService: jest.Mocked<RestaurantService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useValue: createMockRepository() },
        { provide: getRepositoryToken(OrderItem), useValue: createMockRepository() },
        { provide: RestaurantService, useValue: { findOne: jest.fn(), findProducts: jest.fn() } },
        { provide: EventsService, useValue: { emitOrderUpdate: jest.fn(), emitNewOrder: jest.fn() } },
        { provide: NotificationsProducer, useValue: { enqueueOrderStatusChange: jest.fn() } },
      ],
    }).compile();

    service = module.get(OrderService);
    // ...
  });
});
```

#### MatchingService (`src/modules/delivery/matching.service.spec.ts`)

Testar:
1. Retorna driver mais próximo com maior score
2. Aumenta raio quando nenhum driver encontrado no raio inicial
3. Retorna null após MAX_RADIUS sem drivers
4. Lança `ConflictException` se lock falhar

#### PaymentService (`src/modules/payment/payment.service.spec.ts`)

Testar:
1. `initiate` — cria pagamento para pedido pendente
2. `initiate` — falha se pedido já tem pagamento
3. `confirm` — confirma pagamento e chama OrderService
4. `fail` — marca pagamento como falho sem afetar pedido

---

### Helper de mock de repository

`src/common/test/mock-repository.helper.ts`:
```typescript
export const createMockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getOne: jest.fn(),
    getManyAndCount: jest.fn(),
  })),
});
```

---

### Testes de Integração

#### Fluxo completo de pedido (`test/order-flow.e2e-spec.ts`)

```typescript
describe('Order Flow (e2e)', () => {
  // 1. Registrar customer, restaurant_owner, driver
  // 2. Criar restaurante e produtos
  // 3. Customer cria pedido
  // 4. Restaurante confirma pedido
  // 5. Restaurante marca como preparando
  // 6. Restaurante marca como pronto
  // 7. Driver coleta
  // 8. Driver entrega
  // Verificar status do pedido a cada etapa
});
```

#### Fluxo de pagamento (`test/payment-flow.e2e-spec.ts`)

```typescript
describe('Payment Flow (e2e)', () => {
  // 1. Criar pedido
  // 2. Iniciar pagamento
  // 3. Confirmar pagamento → pedido vai para confirmed
  // 4. Verificar que não é possível criar segundo pagamento
});
```

---

### Configuração de banco para testes

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
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/delivery_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=test-secret
```

Adicionar script no `package.json`:
```json
"test:e2e": "dotenv -e .env.test -- jest --config ./test/jest-e2e.json"
```

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e13-tests`
3. Criar todos os arquivos
4. `git add src/**/*.spec.ts test/ src/common/test`
5. `git commit -m "feat: add unit tests for services and e2e tests for order and payment flows"`
6. `git push origin feat/e13-tests`
7. `gh pr create --title "feat: E13 - Unit and integration tests" --base main --body "## O que foi feito\n- Testes unitários: OrderService, MatchingService, PaymentService\n- Mock helper para TypeORM repositories\n- E2E: fluxo completo de pedido (8 etapas)\n- E2E: fluxo de pagamento\n- Configuração de ambiente de teste separado\n\n## Depende de\nPR E12 mergeado\n\n## Como rodar\n\`\`\`bash\nnpm run test         # unitários\nnpm run test:e2e    # integração\n\`\`\`"`

## Regras
- Unitários: mockar todas as dependências externas (Redis, banco, filas)
- E2E: usar banco real em schema isolado (delivery_test)
- Cada teste deve ser independente — limpar banco entre tests com `beforeEach`
- Cobrir os casos de erro, não só o happy path
