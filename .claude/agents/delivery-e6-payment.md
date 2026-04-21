---
name: delivery-e6-payment
description: Etapa 6 do sistema de delivery — implementa o PaymentModule com criação de pagamento, confirmação mock e transição de status do pedido. Depende da Etapa 5. Use após o PR da E5 ser mergeado.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 6 — Payment Module** do sistema de delivery.

## Pré-requisito
PRs das Etapas 1 a 5 mergeados na `main`.

## O que você deve criar

### PaymentModule (`src/modules/payment/`)

**payment.module.ts** — importa TypeOrmModule com Payment entity, importa OrderModule.

**DTOs:**

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
1. Buscar pedido pelo `dto.orderId` — verificar que pertence ao `customerId`
2. Verificar que pedido está em status `pending`
3. Verificar que não existe Payment já criado para esse pedido
4. Criar Payment com status `pending`, amount = order.totalAmount
5. Retornar payment criado

**`confirm(paymentId, dto)`:**
1. Buscar payment pelo id
2. Verificar status é `pending`
3. Atualizar payment: status = `confirmed`, externalId = dto.externalId, confirmedAt = now
4. Chamar `OrderService.updateStatus` para mover pedido de `pending` → `confirmed`
5. Retornar payment atualizado

**`fail(paymentId)`:**
1. Atualizar payment status para `failed`
2. Pedido permanece em `pending` (pode tentar novamente)

**`findByOrder(orderId)`:** busca payment pelo orderId

**`findOne(id)`:** busca payment pelo id

---

### payment.controller.ts

```
POST  /payments              → initiate (@Roles('customer'))
POST  /payments/:id/confirm  → confirm (mock — em prod seria webhook)
POST  /payments/:id/fail     → fail (mock)
GET   /payments/order/:orderId → findByOrder (autenticado)
GET   /payments/:id           → findOne (autenticado)
```

---

### Nota sobre mock
O `confirm` endpoint simula o callback de um gateway de pagamento. Em produção, seria um webhook autenticado. Por ora, aceita qualquer `externalId` como confirmação válida.

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e6-payment-module`
3. Criar todos os arquivos
4. `git add src/modules/payment`
5. `git commit -m "feat: add payment module with mock gateway confirmation"`
6. `git push origin feat/e6-payment-module`
7. `gh pr create --title "feat: E6 - Payment module" --base main --body "## O que foi feito\n- PaymentModule com criação e confirmação de pagamento\n- Integração com OrderService para transição de status\n- Mock de gateway (confirm via endpoint)\n\n## Depende de\nPR E5 mergeado\n\n## Fluxo\n1. POST /payments → cria pagamento pending\n2. POST /payments/:id/confirm → confirma e move pedido para confirmed"`

## Regras
- Um pedido só pode ter um pagamento
- Só confirmar pagamento que está `pending`
- Ao confirmar, sempre disparar a transição do pedido via OrderService
