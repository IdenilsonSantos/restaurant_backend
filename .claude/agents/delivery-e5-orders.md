---
name: delivery-e5-orders
description: Etapa 5 do sistema de delivery — implementa o OrderModule com criação de pedido, snapshot de produtos, cálculo de total e máquina de estados. Depende das Etapas 1-4. Use após o PR da E4 ser mergeado.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 5 — Order Module** do sistema de delivery.

## Pré-requisito
PRs das Etapas 1 a 4 mergeados na `main`.

## O que você deve criar

### OrderModule (`src/modules/order/`)

**order.module.ts** — importa TypeOrmModule com Order e OrderItem entities, importa RestaurantModule.

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

**`create(customerId, dto)`:**
1. Buscar restaurante — lançar `NotFoundException` se não existir ou `isOpen = false`
2. Buscar todos os produtos pelos ids informados em `dto.items`
3. Validar que todos os produtos pertencem ao restaurante e `isAvailable = true`
4. Calcular total: `sum(product.price * item.quantity)`
5. Criar Order com status `pending`
6. Criar OrderItems com snapshot: `productName = product.name`, `productPrice = product.price`, `subtotal = price * qty`
7. Retornar pedido com items

**`findOne(id)`:** busca pedido com relations (items, restaurant, customer)

**`findByCustomer(customerId, page, limit)`:** lista pedidos do cliente com paginação

**`findByRestaurant(restaurantId, page, limit)`:** lista pedidos do restaurante com paginação e filtro de status

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

**`cancel(id, customerId)`:** cancela pedido se status for `pending`

---

### order.controller.ts

```
POST   /orders                    → create (@Roles('customer'))
GET    /orders/:id                → findOne (autenticado)
GET    /orders/my                 → findByCustomer (@Roles('customer'))
GET    /orders/restaurant/:id     → findByRestaurant (@Roles('restaurant_owner'))
PATCH  /orders/:id/status         → updateStatus (autenticado)
DELETE /orders/:id                → cancel (@Roles('customer'))
```

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

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e5-order-module`
3. Criar todos os arquivos
4. `git add src/modules/order`
5. `git commit -m "feat: add order module with state machine and product snapshot"`
6. `git push origin feat/e5-order-module`
7. `gh pr create --title "feat: E5 - Order module" --base main --body "## O que foi feito\n- Criação de pedido com snapshot de produtos\n- Cálculo automático de total\n- Máquina de estados com validação de role por transição\n- Listagem com paginação para customer e restaurante\n\n## Depende de\nPR E4 mergeado\n\n## Regras de negócio\n- Snapshot preserva preço no momento do pedido\n- Transições inválidas retornam 400\n- Role errada para transição retorna 403"`

## Regras
- O snapshot (productName, productPrice) é imutável após a criação
- Nunca recalcular total usando preços atuais dos produtos — usar o snapshot
- Validar que todos os produtos são do mesmo restaurante informado
