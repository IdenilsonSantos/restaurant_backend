---
name: e6-payment
description: Etapa 6 — implementa PaymentModule com criação de pagamento, confirmação mock e transição de status do pedido. Depende da E5.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 6 — Payment Module**.

## Pré-requisito
PRs das E1 a E5 mergeados na `main`.

## O que você deve criar

### PaymentModule (`src/modules/payment/`)

**payment.module.ts** — importa `TypeOrmModule.forFeature([Payment, PaymentMethod])`, importa `OrderModule`.

### DTOs

`create-payment.dto.ts`:
```typescript
export class CreatePaymentDto {
  @IsUUID() orderId: string;
  @IsString() method: string; // 'credit_card' | 'pix' | 'debit_card'
  @IsOptional() @IsString() externalId?: string;
}
```

`confirm-payment.dto.ts`:
```typescript
export class ConfirmPaymentDto {
  @IsString() externalId: string;
}
```

---

### payment.service.ts

**`initiate(customerId, dto)`:**
1. Buscar pedido pelo `dto.orderId` — verificar que `customerId` === `order.customerId`
2. Verificar que pedido está em status `pending`
3. Verificar que não existe `Payment` já criado para esse pedido (unique `orderId`)
4. Criar `Payment` com status `pending`, `amount = order.totalAmount`, `method = dto.method`
5. Retornar payment criado

**`confirm(paymentId, dto)`:**
1. Buscar payment pelo id — `NotFoundException` se não existe
2. Verificar que status é `pending` — `BadRequestException` se já processado
3. Atualizar: `status = confirmed`, `externalId = dto.externalId`, `confirmedAt = new Date()`
4. Salvar payment
5. Chamar `OrderService.updateStatus(order.id, { status: OrderStatus.CONFIRMED }, systemId, 'system')`
   > Usar um userId de sistema ou um identificador especial que o `RolesGuard` permita para transição `pending → confirmed`
6. Retornar payment atualizado

**`fail(paymentId)`:**
1. Buscar payment — `NotFoundException` se não existe
2. Atualizar `status = failed`
3. Pedido permanece `pending` — cliente pode tentar novamente

**`findByOrder(orderId)`:** busca payment pelo orderId; `NotFoundException` se não existe

**`findOne(id)`:** busca payment pelo id

---

### PaymentMethodService (`src/modules/payment/payment-method.service.ts`)

CRUD para métodos de pagamento (gerenciado por admin):
- `create(dto)`, `findAll()`, `findOne(id)`, `update(id, dto)`, `remove(id)`

DTOs: `create-payment-method.dto.ts` (name, code), `update-payment-method.dto.ts` (PartialType).

---

### payment.controller.ts

```
POST /payments                    → initiate (@Roles('customer'))
POST /payments/:id/confirm        → confirm (público — simula webhook em dev)
POST /payments/:id/fail           → fail (público — mock)
GET  /payments/order/:orderId     → findByOrder (autenticado)
GET  /payments/:id                → findOne (autenticado)
```

> `GET /payments/order/:orderId` DEVE vir **antes** de `GET /payments/:id` no controller.

### payment-method.controller.ts
```
POST   /payment-methods       → create (@Roles('admin'))
GET    /payment-methods       → findAll (público)
GET    /payment-methods/:id   → findOne (público)
PATCH  /payment-methods/:id   → update (@Roles('admin'))
DELETE /payment-methods/:id   → remove (@Roles('admin'))
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e6-payment-module
git add src/modules/payment
git commit -m "feat: add payment module with mock gateway and payment methods CRUD"
git push origin feat/e6-payment-module
gh pr create \
  --title "feat: E6 - Payment module" \
  --base main \
  --body "## O que foi feito
- PaymentModule com criação, confirmação e falha de pagamento
- Integração com OrderService para transição pending → confirmed
- PaymentMethodService com CRUD para admin
- Mock de gateway via endpoint (em prod seria webhook)

## Depende de
PR E5 mergeado

## Fluxo
1. POST /api/v1/payments → cria payment pending
2. POST /api/v1/payments/:id/confirm → confirma e move pedido para confirmed"
```

## Regras
- Um pedido só pode ter um pagamento ativo
- Só confirmar payment que está `pending`
- Ao confirmar, sempre disparar transição do pedido via `OrderService`
- `findByOrder` deve retornar o payment existente, não 404 (pedido pode estar aguardando pagamento)
