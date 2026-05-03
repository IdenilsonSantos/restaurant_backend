---
name: e6-payment
description: Etapa 6 — implementa PaymentModule com criação de pagamento, confirmação mock e transição de status do pedido. Depende da E5.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 6 — Payment Module.

## Pré-requisito
PRs E1–E5 mergeados.

## PaymentModule (`src/modules/payment/`)

Importa `TypeOrmModule.forFeature([Payment, PaymentMethod])` e `OrderModule`.

---

## DTOs

**create-payment.dto.ts**: orderId (UUID), method (string: `credit_card | pix | debit_card`), externalId (string, opcional)

**confirm-payment.dto.ts**: externalId (string)

**create-payment-method.dto.ts**: name (string), code (string)

**update-payment-method.dto.ts**: PartialType de create.

---

## PaymentService — métodos

**initiate(customerId, dto)**
1. Buscar pedido pelo `dto.orderId` — verificar `customerId === order.customerId`
2. Verificar status `pending` — `BadRequestException` se outro status
3. Verificar que não existe Payment para esse orderId (unique) — `ConflictException`
4. Criar Payment: `status=pending`, `amount=order.totalAmount`, `method=dto.method`

**confirm(paymentId, dto)**
1. Buscar payment — `NotFoundException` se não existe
2. Verificar `status === pending` — `BadRequestException` se já processado
3. Atualizar: `status=confirmed`, `externalId=dto.externalId`, `confirmedAt=new Date()`
4. Chamar `OrderService.updateStatus(order.id, { status: CONFIRMED }, systemId, 'system')`

**fail(paymentId)** — atualizar `status=failed`; pedido permanece `pending` para nova tentativa.

**findByOrder(orderId)** — retorna payment pelo orderId (não 404 se pendente).

**findOne(id)** — retorna payment pelo id.

---

## PaymentMethodService

CRUD simples: `create`, `findAll`, `findOne`, `update`, `remove`. Gerenciado por admin.

---

## Endpoints

```
POST /payments                  → initiate (@Roles('customer'))
POST /payments/:id/confirm      → confirm (público — simula webhook em dev)
POST /payments/:id/fail         → fail (público — mock)
GET  /payments/order/:orderId   → findByOrder (autenticado)  ← ANTES de /:id
GET  /payments/:id              → findOne (autenticado)

POST   /payment-methods         → create (@Roles('admin'))
GET    /payment-methods         → findAll (público)
GET    /payment-methods/:id     → findOne (público)
PATCH  /payment-methods/:id     → update (@Roles('admin'))
DELETE /payment-methods/:id     → remove (@Roles('admin'))
```

## Commit
```bash
git checkout -b feat/e6-payment-module
git add src/modules/payment
git commit -m "feat: add payment module with mock gateway and payment methods CRUD"
```

## Regras
- Um pedido só pode ter um Payment ativo
- Só confirmar Payment com `status=pending`
- Ao confirmar: sempre disparar transição do pedido via `OrderService`
- `GET /payments/order/:orderId` antes de `GET /payments/:id` no controller
