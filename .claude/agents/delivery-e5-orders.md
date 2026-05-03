---
name: delivery-e5-orders
description: Etapa 5 do sistema de delivery — implementa o OrderModule com criação de pedido, snapshot de produtos, cálculo de total e máquina de estados. Depende das Etapas 1-4. Use após o PR da E4 ser mergeado.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 5 — Order Module** do sistema de delivery.

## Pré-requisito
PRs das Etapas 1 a 4 mergeados na `main`. `RedisModule` disponível globalmente (E7, pode ser paralelo).

## O que você deve criar

### OrderModule (`src/modules/order/`)

**order.module.ts** — importa `TypeOrmModule.forFeature([Order, OrderItem])`, `RestaurantModule`, `forwardRef(() => QueueModule)` e `EventsModule`. O `RedisModule` é global e não precisa ser importado explicitamente.

**DTOs:**

`create-order.dto.ts`:
```typescript
export class CreateOrderItemDto {
  @IsUUID() productId: string;
  @IsInt() @Min(1) quantity: number;
}

export class CreateOrderDto {
  @IsUUID() restaurantId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
  @IsString() deliveryAddress: string;
  @IsNumber() deliveryLatitude: number;
  @IsNumber() deliveryLongitude: number;
  @IsOptional() @IsString() notes?: string;
}
```

`update-order-status.dto.ts`:
```typescript
export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus) status: OrderStatus;
}
```

---

### order.service.ts

Injete `RedisService`, `NotificationsProducer` e `EventsService` além dos repositórios.

**`create(customerId, dto)`:**
1. **Cache Redis** — tentar `redisService.cacheGet<Restaurant>(\`restaurant:${dto.restaurantId}\`)`. Se miss, buscar no DB via `restaurantService.findOne()` e chamar `redisService.cacheSet(\`restaurant:${dto.restaurantId}\`, restaurant, 300)`.
2. Verificar `restaurant.isOpen` — lançar `NotFoundException` se `false`
3. Buscar produtos pelos ids — validar que pertencem ao restaurante e têm `isAvailable = true`
4. Calcular total: `sum(product.price * item.quantity)`
5. Criar `Order` com status `pending`
6. Criar `OrderItem` com snapshot: `productName = product.name`, `productPrice = product.price`, `subtotal = price * qty`
7. Emitir evento real-time via `eventsService.emitNewOrder(restaurantId, payload)`
8. Retornar pedido com items

**`findOne(id)`:** busca pedido com relations `['items', 'restaurant', 'customer']`

**`findByCustomer(customerId, page, limit)`:** lista pedidos do cliente com paginação

**`findByRestaurant(restaurantId, page, limit)`:** lista pedidos do restaurante com paginação e filtro de status opcional

**`updateStatus(id, dto, requesterId, requesterRole)`:**
- Máquina de estados — transições válidas:
  ```
  pending      → confirmed   (só restaurante)
  confirmed    → preparing   (só restaurante)
  preparing    → ready       (só restaurante)
  ready        → picked_up   (só driver)
  picked_up    → delivered   (só driver)
  pending      → cancelled   (customer ou restaurante)
  ```
- Lançar `BadRequestException` se transição inválida
- Lançar `ForbiddenException` se role não permitida para aquela transição
- Após salvar: `notificationsProducer.enqueueOrderStatusChange(order.id, order.customerId, dto.status)` (BullMQ/Redis)
- Após salvar: `eventsService.emitOrderUpdate(customerId, restaurantId, orderId, payload)` (Socket.IO)

**`cancel(id, customerId)`:** cancela pedido se status for `pending`; emite `eventsService.emitOrderUpdate` e enfileira notificação.

---

### order.controller.ts

```
POST   /orders                    → create (@Roles('customer'), @RateLimit(10, 60) — 10 pedidos/min por user)
GET    /orders/:id                → findOne (autenticado)
GET    /orders/my                 → findByCustomer (@Roles('customer'))
GET    /orders/restaurant/:id     → findByRestaurant (@Roles('restaurant_owner'))
PATCH  /orders/:id/status         → updateStatus (autenticado)
DELETE /orders/:id                → cancel (@Roles('customer'))
```

O `@RateLimit()` em `POST /orders` usa `RateLimitGuard` + `RedisService.rateLimit()` com a chave `rate:user:{userId}:orders` — protege contra abuso de criação de pedidos. Adicionar `RateLimitGuard` ao array `@UseGuards()` apenas no endpoint de criação.

---

### Constante de transições válidas

`src/modules/order/constants/order-transitions.constant.ts`:
```typescript
import { OrderStatus } from '../../../common/enums/order-status.enum';

export const ORDER_TRANSITIONS: Record<OrderStatus, { next: OrderStatus; allowedRoles: string[] }[]> = {
  [OrderStatus.PENDING]: [
    { next: OrderStatus.CONFIRMED, allowedRoles: ['restaurant_owner'] },
    { next: OrderStatus.CANCELLED, allowedRoles: ['customer', 'restaurant_owner'] },
  ],
  [OrderStatus.CONFIRMED]: [
    { next: OrderStatus.PREPARING, allowedRoles: ['restaurant_owner'] },
  ],
  [OrderStatus.PREPARING]: [
    { next: OrderStatus.READY, allowedRoles: ['restaurant_owner'] },
  ],
  [OrderStatus.READY]: [
    { next: OrderStatus.PICKED_UP, allowedRoles: ['driver'] },
  ],
  [OrderStatus.PICKED_UP]: [
    { next: OrderStatus.DELIVERED, allowedRoles: ['driver'] },
  ],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};
```

---

## Redis — o que usar e por quê

| Uso | Chave Redis | Justificativa |
|---|---|---|
| Cache de restaurante | `restaurant:{id}` TTL 300s | `create()` consulta o restaurante em toda criação de pedido — cache evita hit no DB |
| Rate limit de criação | `rate:user:{id}:orders` | Previne abuso de `POST /orders` por um mesmo cliente |
| Notificação async | BullMQ (`notifications` queue) | Envia push/email ao cliente quando status muda — desacopla do request HTTP |
| Real-time | Socket.IO via `EventsService` | Notifica restaurante (`restaurant:{id}`) e cliente (`customer:{id}`) instantaneamente |

**O que NÃO usar:**
- ❌ GEO — desnecessário aqui (pertence ao DeliveryModule/DriverModule)
- ❌ Lock distribuído — não há operação que exija exclusividade no OrderModule
- ❌ Cache de `findOne` por pedido — pedidos mudam de status com frequência; cache causaria inconsistência

---

## Fluxo de commit e PR

```bash
git checkout main && git pull origin main
git checkout -b feat/e5-order-module
# criar todos os arquivos
git add src/modules/order
git commit -m "feat: add order module with state machine, redis cache and real-time events"
git push origin feat/e5-order-module
gh pr create \
  --title "feat: E5 - Order module" \
  --base main \
  --body "## O que foi feito
- Criação de pedido com snapshot de produtos e cálculo de total
- Cache Redis do restaurante no fluxo de criação (restaurant:{id} TTL 300s)
- Rate limit em POST /orders (10 req/min por usuário)
- Máquina de estados com validação de role por transição
- Eventos real-time via Socket.IO (order:new, order:update)
- Notificações assíncronas via BullMQ ao mudar status

## Depende de
PRs E4 e E7 mergeados

## Regras de negócio
- Snapshot preserva preço no momento do pedido — nunca recalcular com preço atual
- Transições inválidas retornam 400
- Role errada para transição retorna 403
- Todos os produtos devem pertencer ao restaurante informado"
```

## Regras
- O snapshot (`productName`, `productPrice`) é imutável após a criação
- Nunca recalcular total usando preços atuais dos produtos — usar o snapshot
- Validar que todos os produtos são do mesmo restaurante informado
- Cache de restaurante deve ser invalidado se `RestaurantService.update()` for chamado (`cacheDel(\`restaurant:${id}\`)`)
- Sempre emitir evento Socket.IO **e** enfileirar notificação BullMQ após mudança de status
