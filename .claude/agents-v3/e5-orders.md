---
name: e5-orders
description: Etapa 5 — implementa OrderModule com criação de pedido, snapshot, máquina de estados, rate limit e grupos de opções de produto (fusão de E5 e E5B). Depende das E1-E4 e E7.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 5 — Order Module + Product Options.

## Pré-requisito
PRs E1–E4 e E7 mergeados. `RedisModule` global já disponível.

## OrderModule

Importa: `TypeOrmModule.forFeature([Order, OrderItem, OrderItemOption])`, `RestaurantModule`, `forwardRef(() => QueueModule)`, `EventsModule`.

---

## DTOs

**create-order.dto.ts**:
- `OptionSelectionDto`: groupId (UUID), optionIds (UUID[], não vazio)
- `CreateOrderItemDto`: productId (UUID), quantity (int ≥1), selectedOptions (OptionSelectionDto[], opcional, `@ValidateNested`)
- `CreateOrderDto`: restaurantId (UUID), items (CreateOrderItemDto[], `@ValidateNested`), deliveryAddress (string), deliveryLatitude (number), deliveryLongitude (number), notes (string, opcional)

**update-order-status.dto.ts**: status (enum OrderStatus)

---

## Constante de transições (manter como código — deve ser exata)

```typescript
// src/modules/order/constants/order-transitions.constant.ts
export const ORDER_TRANSITIONS: Record<OrderStatus, { next: OrderStatus; allowedRoles: string[] }[]> = {
  [OrderStatus.PENDING]: [
    { next: OrderStatus.CONFIRMED, allowedRoles: ['restaurant_owner'] },
    { next: OrderStatus.CANCELLED, allowedRoles: ['customer', 'restaurant_owner'] },
  ],
  [OrderStatus.CONFIRMED]: [{ next: OrderStatus.PREPARING, allowedRoles: ['restaurant_owner'] }],
  [OrderStatus.PREPARING]: [{ next: OrderStatus.READY,     allowedRoles: ['restaurant_owner'] }],
  [OrderStatus.READY]:     [{ next: OrderStatus.PICKED_UP, allowedRoles: ['driver'] }],
  [OrderStatus.PICKED_UP]: [{ next: OrderStatus.DELIVERED, allowedRoles: ['driver'] }],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};
```

---

## OrderService — métodos

Injetar: repos de `Order`, `OrderItem`, `OrderItemOption`; `RestaurantService`; `RedisService`; `NotificationsProducer`; `EventsService`.

**create(customerId, dto)**
1. `redisService.getRestaurantStatus(dto.restaurantId)` — se `false`, `BadRequestException('Restaurante fechado')` imediato
2. `cacheGet('restaurant:{id}')` → se miss, buscar no DB e cachear (TTL 300s)
3. Verificar `restaurant.isOpen` novamente pelo objeto (dupla verificação)
4. Buscar produtos com relations `['optionGroups', 'optionGroups.options']`
5. Validar que todos pertencem ao restaurante e `isAvailable=true`
6. Para cada item: calcular `optionsTotal` somando `priceModifier` das opções selecionadas
7. `subtotal = (product.price + optionsTotal) * quantity`
8. Criar snapshots `OrderItemOption` para cada opção (ver validação abaixo)
9. Capturar `deliveryFee = Number(restaurant.deliveryFee ?? 0)` como snapshot
10. `itemsTotal = soma dos subtotais`, `totalAmount = itemsTotal + deliveryFee`
11. Criar Order com os três campos de valor separados
12. `eventsService.emitNewOrder(restaurantId, payload)`

**Validação de opções (chamar em create, por item):**
```
Para cada grupo ativo do produto:
  selectedIds = item.selectedOptions?.find(s => s.groupId === group.id)?.optionIds ?? []
  Se grupo.required && selectedIds.length < grupo.minSelections → BadRequestException
  Se selectedIds.length > grupo.maxSelections → BadRequestException
  Para cada optionId: verificar isAvailable e pertencimento ao grupo → BadRequestException se inválido
  Criar OrderItemOption: optionGroupId, optionGroupName, optionId, optionName, priceModifier (snapshots)
```

**findOne(id)** — relations `['items', 'items.selectedOptions', 'restaurant', 'customer']`

Resposta expõe `itemsTotal`, `deliveryFee` e `totalAmount` separadamente.

**findByCustomer(customerId, page, limit)** — paginado, relations `['restaurant']`

**findByRestaurant(restaurantId, page, limit)** — paginado, relations `['customer', 'items']`

**updateStatus(id, dto, requesterId, requesterRole)**
1. Consultar `ORDER_TRANSITIONS[currentStatus]`
2. `BadRequestException` se transição inválida
3. `ForbiddenException` se role não permitida
4. **NUNCA verificar `restaurant.isOpen`** — pedidos existentes sempre completam o ciclo
5. `notificationsProducer.enqueueOrderStatusChange(order.id, order.customerId, dto.status)`
6. `eventsService.emitOrderUpdate(customerId, restaurantId, orderId, payload)`

**cancel(id, customerId)** — cancela se `pending`; emite evento e enfileira notificação.

---

## Endpoints

```
POST   /orders                → create (@Roles('customer'), @RateLimit(10,60))
GET    /orders/my             → findByCustomer (@Roles('customer'))   ← ANTES de /:id
GET    /orders/restaurant/:id → findByRestaurant (@Roles('restaurant_owner')) ← ANTES de /:id
GET    /orders/:id            → findOne (autenticado)
PATCH  /orders/:id/status     → updateStatus (autenticado)
DELETE /orders/:id            → cancel (@Roles('customer'))
```

`@RateLimit(10, 60)` em `POST /orders` usa chave `rate:user:{userId}:orders`.

---

## PARTE 2 — Product Option Groups

### DTOs (em `src/modules/restaurant/dto/`)

**create-product-option-group.dto.ts**: name (string), description (string, opcional), required (boolean, opcional), minSelections (int ≥0, opcional), maxSelections (int ≥1, opcional), isActive (boolean, opcional), displayOrder (int ≥0, opcional), options (CreateProductOptionDto[], opcional, `@ValidateNested`)

**CreateProductOptionDto**: name (string), priceModifier (number ≥0, opcional), isAvailable (boolean, opcional), displayOrder (int ≥0, opcional)

**update-product-option-group.dto.ts** — PartialType sem `options`

**create-product-option.dto.ts**, **update-product-option.dto.ts** — CRUD simples

### ProductOptionService (`src/modules/restaurant/product-option.service.ts`)

Injetar repos de `ProductOptionGroup`, `ProductOption`, `Product`, e `RedisService`.

Cache: chave `product:{productId}:option-groups` TTL 300s. Invalidar em **todos** os métodos de escrita.

- **createGroup(productId, restaurantId, dto)** — verificar produto pertence ao restaurante; criar grupo + opções em cascata; invalidar cache
- **findGroupsByProduct(productId)** — apenas `isActive=true`, opções `isAvailable=true`, order por `displayOrder`; usar cache
- **findAllGroupsByProduct(productId)** — todos (admin); sem cache
- **updateGroup(groupId, restaurantId, dto)** — verificar ownership; validar `minSelections <= maxSelections`; invalidar cache
- **deleteGroup(groupId, restaurantId)** — verificar ownership; cascade; invalidar cache
- **createOption(groupId, restaurantId, dto)** — verificar ownership via group→product→restaurantId; invalidar cache
- **updateOption(optionId, restaurantId, dto)** — verificar ownership; invalidar cache
- **deleteOption(optionId, restaurantId)** — verificar ownership; invalidar cache

### Endpoints de opções

```
POST   /restaurants/:restaurantId/products/:productId/option-groups                              → createGroup (@Roles('restaurant_owner'))
GET    /restaurants/:restaurantId/products/:productId/option-groups                              → findGroupsByProduct (público)
PATCH  /restaurants/:restaurantId/products/:productId/option-groups/:groupId                     → updateGroup (@Roles('restaurant_owner'))
DELETE /restaurants/:restaurantId/products/:productId/option-groups/:groupId                     → deleteGroup (@Roles('restaurant_owner'))
POST   /restaurants/:restaurantId/products/:productId/option-groups/:groupId/options             → createOption (@Roles('restaurant_owner'))
PATCH  /restaurants/:restaurantId/products/:productId/option-groups/:groupId/options/:optionId   → updateOption (@Roles('restaurant_owner'))
DELETE /restaurants/:restaurantId/products/:productId/option-groups/:groupId/options/:optionId   → deleteOption (@Roles('restaurant_owner'))
```

### Registrar no módulo

`RestaurantModule`: adicionar `ProductOptionGroup`, `ProductOption` ao `forFeature`; `ProductOptionService` aos providers/exports.
`OrderModule`: adicionar `OrderItemOption` ao `forFeature`.

---

## Migration
```bash
npm run migration:generate -- src/database/migrations/AddProductOptions
npm run migration:run
```

## Commit
```bash
git checkout -b feat/e5-orders-and-options
git add src/modules/order src/modules/restaurant/dto/*option* src/modules/restaurant/product-option.service.ts src/database/migrations/
git commit -m "feat: add order module with state machine, product options and snapshots"
```

## Regras
- **Snapshot imutável** — nunca atualizar `order_items`, `order_item_options` ou `deliveryFee` após criação
- `totalAmount = itemsTotal + deliveryFee` — nunca somar apenas os itens
- `isOpen` verificado **somente** em `create()` — `updateStatus()` nunca verifica
- Sempre emitir Socket.IO **e** enfileirar BullMQ após mudança de status
- `minSelections <= maxSelections` — validar no DTO e no service
