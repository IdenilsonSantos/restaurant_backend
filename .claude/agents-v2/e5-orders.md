---
name: e5-orders
description: Etapa 5 — implementa OrderModule com criação de pedido, snapshot, máquina de estados, rate limit e grupos de opções de produto com snapshot e validação (fusão de E5 e E5B). Depende das E1-E4 e E7.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 5 — Order Module + Product Options**.

## Pré-requisito
PRs das E1 a E4 e E7 mergeados na `main`. O `RedisModule` global já está disponível.

---

## PARTE 1 — Order Module

### order.module.ts
Importa:
- `TypeOrmModule.forFeature([Order, OrderItem, OrderItemOption])`
- `RestaurantModule` (para buscar produtos e restaurantes)
- `forwardRef(() => QueueModule)` (para NotificationsProducer)
- `EventsModule` (para EventsService)

`RedisModule` é global — não precisa importar.

---

### DTOs

`create-order.dto.ts`:
```typescript
export class OptionSelectionDto {
  @IsUUID() groupId: string;
  @IsArray() @ArrayNotEmpty() @IsUUID('all', { each: true }) optionIds: string[];
}

export class CreateOrderItemDto {
  @IsUUID() productId: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionSelectionDto)
  selectedOptions?: OptionSelectionDto[];
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

### Constante de transições

`src/modules/order/constants/order-transitions.constant.ts`:
```typescript
export const ORDER_TRANSITIONS: Record<OrderStatus, { next: OrderStatus; allowedRoles: string[] }[]> = {
  [OrderStatus.PENDING]: [
    { next: OrderStatus.CONFIRMED,  allowedRoles: ['restaurant_owner'] },
    { next: OrderStatus.CANCELLED,  allowedRoles: ['customer', 'restaurant_owner'] },
  ],
  [OrderStatus.CONFIRMED]: [
    { next: OrderStatus.PREPARING,  allowedRoles: ['restaurant_owner'] },
  ],
  [OrderStatus.PREPARING]: [
    { next: OrderStatus.READY,      allowedRoles: ['restaurant_owner'] },
  ],
  [OrderStatus.READY]: [
    { next: OrderStatus.PICKED_UP,  allowedRoles: ['driver'] },
  ],
  [OrderStatus.PICKED_UP]: [
    { next: OrderStatus.DELIVERED,  allowedRoles: ['driver'] },
  ],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};
```

---

### order.service.ts

Injetar: repositórios de `Order`, `OrderItem`, `OrderItemOption`; `RestaurantService`; `RedisService`; `NotificationsProducer`; `EventsService`.

**`create(customerId, dto)`:**
1. **Verificação rápida de status**: `redisService.getRestaurantStatus(dto.restaurantId)` — se retornar `false`, lançar `BadRequestException('Restaurante fechado')` imediatamente, sem consultar cache ou banco
2. Cache Redis `restaurant:{dto.restaurantId}` (TTL 300s) — se miss, buscar no DB e cachear
3. Verificar `restaurant.isOpen` novamente pelo objeto completo (dupla verificação para o caso de a chave de status não existir no Redis)
4. Buscar produtos: `relations: ['optionGroups', 'optionGroups.options']`
5. Validar que todos pertencem ao restaurante e `isAvailable = true`
6. Para cada item: calcular `optionsTotal` somando `priceModifier` das opções selecionadas
7. `orderItem.subtotal = (product.price + optionsTotal) * quantity`
8. Criar `OrderItemOption` snapshots para cada opção selecionada (ver validação abaixo)
9. **Capturar taxa de entrega como snapshot:**
   ```typescript
   const deliveryFee = Number(restaurant.deliveryFee ?? 0);
   const itemsTotal  = items.reduce((sum, item) => sum + Number(item.subtotal), 0);
   const totalAmount = itemsTotal + deliveryFee;
   ```
10. Criar `Order` com `itemsTotal`, `deliveryFee` (snapshot) e `totalAmount`
11. Salvar Order, OrderItems e OrderItemOptions
12. `eventsService.emitNewOrder(restaurantId, payload)`
13. Retornar pedido com relations

> **Regra de snapshot**: `deliveryFee` no pedido NUNCA é recalculado com o valor atual do restaurante — o valor capturado no momento da criação é imutável, assim como `productPrice` nos itens.

**Validação de opções por item (chamar em `create`):**
```
Para cada grupo ativo do produto:
  selectedIds = item.selectedOptions?.find(s => s.groupId === group.id)?.optionIds ?? []
  Se grupo.required && selectedIds.length < grupo.minSelections → BadRequestException
  Se selectedIds.length > grupo.maxSelections → BadRequestException
  Para cada optionId: verificar isAvailable e pertencimento ao grupo → BadRequestException se inválido
  Criar snapshot OrderItemOption com: orderItemId, optionGroupId, optionGroupName, optionId, optionName, priceModifier
```

**`findOne(id)`:** relations `['items', 'items.selectedOptions', 'restaurant', 'customer']`

A resposta de `findOne` deve expor os três campos de valor separadamente:
```json
{
  "id": "...",
  "itemsTotal": "42.00",
  "deliveryFee": "5.99",
  "totalAmount": "47.99",
  "items": [...]
}
```
Se `deliveryFee = 0`, o frontend pode exibir "Entrega grátis".

**`findByCustomer(customerId, page, limit)`:** paginado com relations `['restaurant']`

**`findByRestaurant(restaurantId, page, limit)`:** paginado com relations `['customer', 'items']`

**`updateStatus(id, dto, requesterId, requesterRole)`:**
- Consultar `ORDER_TRANSITIONS[currentStatus]`
- `BadRequestException` se transição inválida
- `ForbiddenException` se role não permitida
- **NUNCA verificar `restaurant.isOpen` aqui** — o status do restaurante é irrelevante para pedidos já criados; eles sempre completam seu ciclo de vida
- Após salvar: `notificationsProducer.enqueueOrderStatusChange(order.id, order.customerId, dto.status)`
- Após salvar: `eventsService.emitOrderUpdate(customerId, restaurantId, orderId, payload)`

**`cancel(id, customerId)`:** cancela se `pending`; emite evento e enfileira notificação.

> **Garantia de in-flight orders**: Pedidos criados antes do restaurante fechar são **garantidos**. Uma vez que um pedido existe no banco (`status != cancelled`), ele percorre todo o ciclo de vida independentemente do `isOpen` do restaurante. A verificação de `isOpen` acontece **somente** em `create()` — nunca em `updateStatus()` ou qualquer outra operação sobre pedidos existentes.

---

### order.controller.ts

```
POST   /orders                  → create (@Roles('customer'), @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard), @RateLimit(10, 60))
GET    /orders/my               → findByCustomer (@Roles('customer'))
GET    /orders/restaurant/:id   → findByRestaurant (@Roles('restaurant_owner'))
GET    /orders/:id              → findOne (autenticado)
PATCH  /orders/:id/status       → updateStatus (autenticado)
DELETE /orders/:id              → cancel (@Roles('customer'))
```

`@RateLimit(10, 60)` em `POST /orders` usa `rate:user:{userId}:orders` — 10 pedidos/min por usuário.
`RateLimitGuard` deve estar em `src/common/guards/rate-limit.guard.ts`.

> **Atenção**: `GET /orders/my` e `GET /orders/restaurant/:id` devem vir **antes** de `GET /orders/:id`.

---

## PARTE 2 — Product Option Groups

### Novas entidades (já criadas na E2)
- `ProductOptionGroup`, `ProductOption`, `OrderItemOption` — verificar que existem

### DTOs em `src/modules/restaurant/dto/`

`create-product-option-group.dto.ts`:
```typescript
export class CreateProductOptionDto {
  @IsString() name: string;
  @IsOptional() @IsNumber() @Min(0) priceModifier?: number;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class CreateProductOptionGroupDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() @Min(0) minSelections?: number;
  @IsOptional() @IsInt() @Min(1) maxSelections?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateProductOptionDto)
  options?: CreateProductOptionDto[];
}
```

`update-product-option-group.dto.ts` — PartialType sem `options`.
`create-product-option.dto.ts`, `update-product-option.dto.ts` — CRUD simples.

---

### ProductOptionService (`src/modules/restaurant/product-option.service.ts`)

```typescript
@Injectable()
export class ProductOptionService {
  constructor(
    @InjectRepository(ProductOptionGroup) private groupRepo,
    @InjectRepository(ProductOption) private optionRepo,
    @InjectRepository(Product) private productRepo,
    private redisService: RedisService,
  ) {}
```

**Cache:** chave `product:{productId}:option-groups` TTL 300s. Invalidar em **todos** os métodos de escrita.

- `createGroup(productId, restaurantId, dto)` — verificar produto pertence ao restaurante; criar grupo + opções em cascata; invalidar cache
- `findGroupsByProduct(productId)` — apenas `isActive=true`, opções `isAvailable=true`, ordenados por `displayOrder`; com cache
- `findAllGroupsByProduct(productId)` — todos (admin); sem cache
- `updateGroup(groupId, restaurantId, dto)` — verificar ownership; validar `minSelections <= maxSelections`; invalidar cache
- `deleteGroup(groupId, restaurantId)` — verificar ownership; cascade remove options; invalidar cache
- `createOption(groupId, restaurantId, dto)` — verificar ownership via group→product→restaurantId; invalidar cache
- `updateOption(optionId, restaurantId, dto)` — verificar ownership; invalidar cache
- `deleteOption(optionId, restaurantId)` — verificar ownership; invalidar cache

---

### Endpoints de opções no controller

Criar `src/modules/restaurant/product-option.controller.ts` ou adicionar ao controller existente:

```
POST   /restaurants/:restaurantId/products/:productId/option-groups          → createGroup (@Roles('restaurant_owner'), @RateLimit(30, 60))
GET    /restaurants/:restaurantId/products/:productId/option-groups          → findGroupsByProduct (público)
PATCH  /restaurants/:restaurantId/products/:productId/option-groups/:groupId → updateGroup (@Roles('restaurant_owner'))
DELETE /restaurants/:restaurantId/products/:productId/option-groups/:groupId → deleteGroup (@Roles('restaurant_owner'))
POST   /restaurants/:restaurantId/products/:productId/option-groups/:groupId/options → createOption (@Roles('restaurant_owner'))
PATCH  /restaurants/:restaurantId/products/:productId/option-groups/:groupId/options/:optionId → updateOption (@Roles('restaurant_owner'))
DELETE /restaurants/:restaurantId/products/:productId/option-groups/:groupId/options/:optionId → deleteOption (@Roles('restaurant_owner'))
```

---

### Registrar no módulo

`RestaurantModule`: adicionar `ProductOptionGroup`, `ProductOption` ao `forFeature`, `ProductOptionService` aos providers/exports.
`OrderModule`: adicionar `OrderItemOption` ao `forFeature`.

---

### Redis — resumo de uso nesta etapa

| Uso | Chave | TTL |
|---|---|---|
| Cache restaurante | `restaurant:{id}` | 300s |
| Cache grupos de opções | `product:{id}:option-groups` | 300s |
| Rate limit criação pedido | `rate:user:{id}:orders` | 60s |
| Notificação async | BullMQ `notifications` | — |
| Real-time | Socket.IO via EventsService | — |

---

## Migration
```bash
npm run migration:generate -- src/database/migrations/AddProductOptions
npm run migration:run
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e5-orders-and-options
git add src/modules/order src/modules/restaurant/dto/create-product-option*.ts \
        src/modules/restaurant/dto/update-product-option*.ts \
        src/modules/restaurant/product-option.service.ts \
        src/modules/restaurant/product-option.controller.ts \
        src/database/migrations/
git commit -m "feat: add order module with state machine, product options and snapshots"
git push origin feat/e5-orders-and-options
gh pr create \
  --title "feat: E5 - Order module + product option groups" \
  --base main \
  --body "## O que foi feito
- OrderModule: criação de pedido com snapshot de produtos e cálculo de total
- Grupos de opções por produto (required/min/max), com cache Redis (300s)
- Snapshot imutável de opções no momento do pedido (OrderItemOption)
- Subtotal ajustado com priceModifier das opções selecionadas
- Rate limit em POST /orders (10 req/min)
- Máquina de estados com validação de role por transição
- Eventos real-time via Socket.IO + notificações assíncronas BullMQ

## Depende de
PRs E4 e E7 mergeados

## Regras de negócio
- Snapshot preserva nome e preço no momento do pedido
- Grupos inativos não são validados
- Opções indisponíveis retornam 400
- Cache invalidado em qualquer escrita de grupo/opção"
```

## Regras
- **Snapshot é imutável** — nunca atualizar `order_items`, `order_item_options` ou `deliveryFee` após criação
- `deliveryFee` do pedido = `restaurant.deliveryFee` no momento da criação — imutável como `productPrice`
- `totalAmount = itemsTotal + deliveryFee` — nunca somar apenas os itens
- Se `restaurant.deliveryFee = 0`: `deliveryFee = 0`, `totalAmount = itemsTotal` (entrega grátis)
- Validar que todos os produtos pertencem ao restaurante informado
- Cache `restaurant:{id}` deve ser invalidado no `RestaurantService.update()` e `setDeliveryFee()`
- **`isOpen` verificado SOMENTE em `create()`** — `updateStatus()` nunca verifica o status do restaurante
- **Pedidos in-flight são garantidos**: fechar o restaurante não cancela nem interrompe pedidos existentes
- Sempre emitir Socket.IO **e** enfileirar BullMQ após mudança de status
- `minSelections <= maxSelections` — validar no DTO e no service de grupos
