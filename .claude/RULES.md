# RULES.md — Regras de codificação do projeto

---

## Comentários no código

Padrão: **sem comentários por padrão.**

Adicionar comentário apenas quando o PORQUÊ é não-óbvio — uma restrição oculta, um invariante sutil, um workaround para um bug específico, comportamento que surpreenderia um leitor.

```typescript
// Bom — explica uma decisão não-óbvia
// SET NX garante atomicidade; sem isso dois workers podem atribuir o mesmo driver
const locked = await redis.set(`lock:${driverId}`, '1', 'NX', 'PX', 30000);

// Ruim — o nome já diz isso
// Verifica se o usuário existe
const user = await userRepo.findOne({ where: { id } });
```

**Nunca escrever:**
- Comentários que descrevem O QUE o código faz (os nomes de variáveis/funções já fazem isso)
- Blocos de comentário com múltiplas linhas para operações simples
- `// usado por X`, `// adicionado para o fluxo Y` — isso pertence ao PR description, não ao código
- JSDoc/docstrings em métodos internos de service (só em interfaces públicas se necessário)
- Comentários de seção como `// ── Busca avançada ──────────`

---

## Estrutura e organização

- Rotas literais (`/search`, `/featured`, `/my`) **antes** de `/:id` nos controllers
- Módulos `@Global()` (`RedisModule`, `StorageModule`, `EventsModule`) — nunca re-importar em feature modules
- `ValidationPipe` global com `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`
- Prefixo global **sempre** `api/v1` — nunca apenas `api`
- Erros padronizados via `GlobalExceptionFilter`: `{ statusCode, timestamp, path, message }`

---

## Snapshots — imutáveis após criação

Campos capturados no momento da criação e **nunca recalculados**:

| Tabela | Campos snapshot |
|---|---|
| `order_items` | `productName`, `productPrice`, `subtotal` |
| `order_item_options` | `optionGroupName`, `optionName`, `priceModifier` |
| `orders` | `deliveryFee` (= `restaurant.deliveryFee` no momento do pedido) |
| `orders` | `itemsTotal` (= soma dos subtotais), `totalAmount` (= `itemsTotal + deliveryFee`) |

---

## Máquina de estados de pedido

Centralizada em `src/modules/order/constants/order-transitions.constant.ts`. Nunca inline.

`updateStatus()` **nunca** verifica `restaurant.isOpen` — pedidos existentes são sempre garantidos, independentemente do status do restaurante.

---

## Restaurante — open/close

`setStatus()` deve executar 3 ações em ordem:
1. `setRestaurantOpen(id, isOpen)` — chave Redis sem TTL (bloqueio imediato)
2. `cacheDel('restaurant:{id}')` — invalida cache do objeto
3. `emitRestaurantStatus(...)` — Socket.IO para rooms `restaurant:{id}` e `restaurant-status:{id}`

`setDeliveryFee()` e `setOperatingHours()` também invalidam `cacheDel('restaurant:{id}')`.

Fechar o restaurante **não cancela** pedidos em andamento.

---

## Driver matching

1. `GEOSEARCH drivers:geo` — raio 3 → 6 → 9 → 12 → 15 km
2. Filtrar `isAvailable=true` no DB
3. Score: `(1/distanceKm)*0.6 + (rating/5)*0.4`
4. `SET lock:driver:{id} NX PX 30000` **antes** de qualquer escrita no DB
5. Liberar lock no `finally` — nunca vazar
6. Nunca verificar `restaurant.isOpen` durante matching

---

## WebSocket

Nunca usar `server.emit()`. Sempre emitir para rooms específicas:

| Room | Eventos |
|---|---|
| `customer:{id}` | `order:update` |
| `restaurant:{id}` | `order:new`, `order:update`, `restaurant:status` |
| `restaurant-status:{id}` | `restaurant:status` (clientes assistindo) |
| `driver:{id}` | `delivery:request` |
| `order:{id}` | `order:update`, `location:update` |

---

## Storage

- `StorageService` é `@Global()` — injetar direto, não importar o módulo
- Keys sempre com UUID gerado — nunca usar o nome original do arquivo (colisão + path traversal)
- Deletar arquivo anterior **antes** de salvar nova URL no banco
- Validar por `file.mimetype`, não por extensão

---

## Segurança

- Nunca retornar `passwordHash` em nenhuma resposta
- `forgotPassword` sempre retorna 200 mesmo se email não existe (previne user enumeration)
- Token de reset: `crypto.randomBytes(32).toString('hex')` — nunca `Math.random()`
- Nunca logar senhas, tokens JWT, números de cartão ou CPF

---

## Filas BullMQ

- Retry **automático** (3×, exponential backoff) para erros de infra (Redis down, crash)
- Retry **manual** com delay crescente (`attempt × 5s`, até 5 tentativas) para "nenhum driver disponível"
- `jobId = match-{deliveryId}-{attempt}` — evita jobs duplicados

---

## Cache Redis — invalidação obrigatória

| Evento | Chave a invalidar |
|---|---|
| Qualquer update de restaurante | `restaurant:{id}` |
| `setStatus()` | `restaurant:{id}:status` + `restaurant:{id}` |
| Criar/atualizar/deletar option group ou option | `product:{id}:option-groups` |
| Atualizar produto | `product:{id}:detail` |
| Atualizar listagem de tags | `tags:all` |
