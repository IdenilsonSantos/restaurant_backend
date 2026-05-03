# System Overview — Delivery Backend

Stack: **NestJS · TypeORM · PostgreSQL · Redis (ioredis) · BullMQ · Socket.IO · Passport JWT · Winston · @nestjs/schedule**

---

## 1. Arquitetura geral

```
Client (HTTP / WebSocket)
        │
        ▼
  NestJS (api/v1)
  ├── Auth (JWT + Passport)
  ├── GlobalExceptionFilter
  ├── ValidationPipe (whitelist + transform)
  ├── RequestLoggerInterceptor
  └── RateLimitGuard (Redis)
        │
  ┌─────┴──────────────────────────────────────────────┐
  │                    Módulos de negócio               │
  │  Restaurant · User · Driver · Order · Payment       │
  │  Delivery · Queue · Events · Health                 │
  │  Category · Location · Storage                      │
  └─────────────────────────────────────────────────────┘
        │                │              │
      PostgreSQL        Redis         BullMQ
    (TypeORM)         (ioredis)    (delivery-matching
                                    notifications)
```

---

## 2. Módulos e responsabilidades

| Módulo | Caminho | Responsabilidade |
|---|---|---|
| AuthModule | `src/modules/auth/` | JWT register/login, forgot/reset password com email |
| UserModule | `src/modules/user/` | CRUD de usuários, avatar upload |
| RestaurantModule | `src/modules/restaurant/` | CRUD restaurantes/produtos, busca, avaliações, favoritos, open/close, horário |
| DriverModule | `src/modules/driver/` | Perfil do entregador, localização, disponibilidade |
| OrderModule | `src/modules/order/` | Criação de pedidos, state machine, opções de produto |
| PaymentModule | `src/modules/payment/` | Pagamentos, confirmação, métodos de pagamento |
| DeliveryModule | `src/modules/delivery/` | Entrega, matching de driver, tracking |
| RedisModule | `src/modules/redis/` | Cliente Redis global + todos os helpers |
| QueueModule | `src/modules/queue/` | BullMQ: filas delivery-matching e notifications |
| EventsModule | `src/modules/events/` | Gateway Socket.IO, rooms, eventos em tempo real |
| CategoryModule | `src/modules/category/` | Tags (Popular, Fast Delivery, etc.) para restaurantes e produtos |
| LocationModule | `src/modules/location/` | Endereços estruturados, geocodificação |
| StorageModule | `src/modules/storage/` | Upload de imagens (local dev / S3 prod) |
| HealthModule | `src/modules/health/` | Health check endpoint |

---

## 3. Banco de dados — Entidades completas

### 3.1 `users`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | varchar | |
| email | varchar | unique, @Index |
| passwordHash | varchar | nunca retornado |
| phone | varchar | |
| role | enum | `customer \| restaurant_owner \| driver \| admin` |
| avatarUrl | varchar | nullable, URL pública |
| resetPasswordToken | varchar | nullable, expira em 1h |
| resetPasswordExpires | timestamp | nullable |
| createdAt, updatedAt | timestamp | |

### 3.2 `restaurants`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| ownerId | uuid FK → users | @Index |
| name | varchar | @Index |
| description | text | |
| address | varchar | string formatada (compatibilidade) |
| latitude, longitude | decimal(10,7) | coordenadas |
| **isOpen** | boolean | default false — estado atual |
| **closedAt** | timestamp | nullable — quando foi fechado |
| **closedMessage** | varchar | nullable — "Abrimos às 18h!" |
| **scheduledReopenAt** | timestamp | nullable — reabertura automática |
| **openingTime** | varchar(5) | nullable — "11:00" |
| **closingTime** | varchar(5) | nullable — "22:30" |
| **timezone** | varchar | default "America/Sao_Paulo" |
| isFeatured | boolean | default false |
| estimatedDeliveryMinutes | int | default 30 |
| averageRating | decimal(3,2) | recalculado por SQL |
| totalReviews | int | default 0 |
| totalOrders | int | default 0 |
| logoUrl, bannerUrl | varchar | nullable |
| deliveryFee | decimal(8,2) | default 0 |
| createdAt, updatedAt | timestamp | |

### 3.3 `products`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| restaurantId | uuid FK | @Index |
| name, description | varchar/text | |
| price | decimal(10,2) | |
| imageUrl | varchar | nullable |
| isAvailable | boolean | default true |
| **preparationMinutes** | int | default 10 |
| **averageRating** | decimal(3,2) | default 0 |
| **totalRatings** | int | default 0 |
| **cuisineOrigin** | varchar | nullable — "Japonesa", "Italiana" |
| **isFeatured** | boolean | default false |
| **calories** | int | nullable |
| createdAt, updatedAt | timestamp | |

### 3.4 `product_option_groups`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| productId | uuid FK CASCADE | @Index |
| name, description | varchar/text | |
| required | boolean | default false |
| minSelections | int | default 0 |
| maxSelections | int | default 1 |
| isActive | boolean | default true |
| displayOrder | int | default 0 |

### 3.5 `product_options`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| groupId | uuid FK CASCADE | @Index |
| name | varchar | |
| priceModifier | decimal(10,2) | default 0 |
| isAvailable | boolean | default true |
| displayOrder | int | default 0 |

### 3.6 `restaurant_reviews`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| restaurantId | uuid | @Index |
| customerId | uuid | @Index |
| orderId | uuid | FK → orders |
| rating | smallint | 1–5 |
| comment | text | nullable |
| createdAt | timestamp | |
| **UNIQUE** | (customerId, orderId) | um review por cliente por pedido |

### 3.7 `product_ratings`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| productId | uuid | @Index |
| customerId | uuid | @Index |
| orderItemId | uuid | FK → order_items |
| rating | smallint | 1–5 |
| comment | text | nullable |
| createdAt | timestamp | |
| **UNIQUE** | (customerId, orderItemId) | um rating por item por cliente |

### 3.8 `user_favorite_restaurants`
| Campo | Tipo | Notas |
|---|---|---|
| userId | uuid PK | @Index |
| restaurantId | uuid PK | @Index |
| createdAt | timestamp | |
| **CASCADE** | ON DELETE | ao deletar user ou restaurant |

### 3.9 `orders`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| customerId | uuid FK | @Index |
| restaurantId | uuid FK | @Index |
| status | enum OrderStatus | default pending, @Index |
| **itemsTotal** | decimal(10,2) | soma dos subtotais dos itens |
| **deliveryFee** | decimal(10,2) | snapshot da taxa no momento do pedido |
| **totalAmount** | decimal(10,2) | itemsTotal + deliveryFee |
| deliveryAddress | varchar | string formatada |
| deliveryAddressId | uuid FK nullable | referência a Address salvo |
| deliveryLatitude, deliveryLongitude | decimal(10,7) | |
| notes | text | nullable |
| createdAt, updatedAt | timestamp | |

### 3.10 `order_items`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| orderId | uuid FK | @Index |
| productId | uuid FK | |
| productName | varchar | **snapshot** |
| productPrice | decimal(10,2) | **snapshot** |
| quantity | int | |
| subtotal | decimal(10,2) | (productPrice + optionsTotal) × qty |

### 3.11 `order_item_options`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| orderItemId | uuid FK CASCADE | @Index |
| optionGroupId, optionGroupName | uuid/varchar | **snapshot** |
| optionId, optionName | uuid/varchar | **snapshot** |
| priceModifier | decimal(10,2) | **snapshot** |

### 3.12 `drivers`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| userId | uuid FK unique | |
| vehicleType, licensePlate | varchar | |
| rating | decimal(3,2) | default 5.0 |
| isAvailable | boolean | default false, @Index |
| currentLatitude, currentLongitude | decimal(10,7) | nullable |
| createdAt, updatedAt | timestamp | |

### 3.13 `deliveries`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| orderId | uuid FK unique | |
| driverId | uuid FK nullable | @Index |
| status | enum DeliveryStatus | default waiting, @Index |
| pickedUpAt, deliveredAt | timestamp | nullable |
| createdAt, updatedAt | timestamp | |

### 3.14 `payments`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| orderId | uuid FK unique | |
| amount | decimal(10,2) | |
| status | enum PaymentStatus | default pending, @Index |
| method | varchar | 'credit_card', 'pix', 'debit_card' |
| externalId | varchar | nullable |
| confirmedAt | timestamp | nullable |
| createdAt, updatedAt | timestamp | |

### 3.15 `payment_methods`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | varchar | |
| code | varchar | unique |
| isActive | boolean | default true |
| createdAt, updatedAt | timestamp | |

### 3.16 `restaurant_payment_methods` (junção M:M)
restaurantId + paymentMethodId

### 3.17 `tags`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | varchar | unique — "Popular", "Fast Delivery" |
| slug | varchar | unique — "popular", "fast_delivery" |
| icon | varchar | nullable — "🔥" |
| color | varchar | nullable — "#FF5733" |
| scope | enum | `restaurant \| product \| both` |
| isActive | boolean | default true |
| displayOrder | int | default 0 |
| isAutomatic | boolean | gerenciado por algoritmo |
| createdAt, updatedAt | timestamp | |

### 3.18 `restaurant_tags` / `product_tags` (junção)
restaurantId/productId + tagId + assignedAt

### 3.19 `addresses`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| userId | uuid nullable | FK → users CASCADE |
| restaurantId | uuid nullable | FK → restaurants CASCADE |
| street, number, complement, neighborhood | varchar | |
| city, state | varchar | obrigatórios |
| country | varchar(2) | ISO 3166-1 alpha-2, default "BR" |
| zipCode | varchar | nullable |
| latitude, longitude | decimal(10,7) | nullable |
| type | enum | `home \| work \| other \| restaurant \| pickup` |
| isPrimary | boolean | max 1 por user/restaurant |
| label | varchar | nullable — "Casa", "Escritório" |
| createdAt, updatedAt | timestamp | |
| **CHECK** | userId XOR restaurantId | sempre um dos dois, nunca ambos |

---

## 4. ENUMs

| Enum | Valores |
|---|---|
| OrderStatus | `pending · confirmed · preparing · ready · picked_up · delivered · cancelled` |
| DeliveryStatus | `waiting · assigned · picked_up · delivered · failed` |
| PaymentStatus | `pending · confirmed · failed · refunded` |
| AddressType | `home · work · other · restaurant · pickup` |
| TagScope | `restaurant · product · both` |

### Máquina de estados de pedido

```
pending  ──→ confirmed   (restaurant_owner)
         ──→ cancelled   (customer | restaurant_owner)
confirmed ──→ preparing  (restaurant_owner)
preparing ──→ ready      (restaurant_owner)
ready     ──→ picked_up  (driver)
picked_up ──→ delivered  (driver)
```

---

## 5. Todos os endpoints REST

Prefixo global: **`/api/v1`**

### Auth
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/auth/register` | público | Registrar customer ou driver |
| POST | `/auth/login` | público | Login, retorna accessToken |
| GET | `/auth/me` | JWT | Dados do usuário logado |
| POST | `/auth/forgot-password` | público | Envia email com token de reset |
| POST | `/auth/reset-password` | público | Redefine senha com token |

### Users
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/users/:id` | JWT | Buscar usuário |
| PATCH | `/users/:id` | JWT | Atualizar usuário |
| DELETE | `/users/:id` | JWT | Remover usuário |
| POST | `/users/me/avatar` | JWT | Upload de avatar |
| DELETE | `/users/me/avatar` | JWT | Remover avatar |
| GET | `/users/me/addresses` | customer/driver | Listar endereços |
| POST | `/users/me/addresses` | customer/driver | Criar endereço |
| PATCH | `/users/me/addresses/:id` | customer/driver | Atualizar endereço |
| DELETE | `/users/me/addresses/:id` | customer/driver | Remover endereço |
| PATCH | `/users/me/addresses/:id/primary` | customer/driver | Definir endereço principal |

### Restaurants
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/restaurants` | restaurant_owner | Criar restaurante |
| GET | `/restaurants` | público | Listar (paginado) |
| GET | `/restaurants/search` | público | Busca avançada com filtros e ordenação |
| GET | `/restaurants/featured` | público | Destaques (isFeatured=true, isOpen=true) |
| GET | `/restaurants/nearby` | público | Por distância (Haversine) |
| GET | `/restaurants/fastest` | público | Menor tempo de entrega ajustado |
| GET | `/restaurants/favorites/my` | customer | Meus favoritos |
| GET | `/restaurants/:id` | público | Detalhes + closedAt + closedMessage |
| PATCH | `/restaurants/:id` | restaurant_owner | Atualizar |
| DELETE | `/restaurants/:id` | restaurant_owner | Remover |
| **PATCH** | `/restaurants/:id/status` | restaurant_owner | Abrir/fechar + closedMessage + scheduledReopenAt |
| **PATCH** | `/restaurants/:id/operating-hours` | restaurant_owner | Definir openingTime/closingTime/timezone |
| PATCH | `/restaurants/:id/delivery-fee` | admin | Definir taxa de entrega |
| POST | `/restaurants/:id/products` | restaurant_owner | Criar produto |
| GET | `/restaurants/:id/products` | público | Listar produtos disponíveis |
| PATCH | `/restaurants/:id/products/:pId` | restaurant_owner | Atualizar produto |
| DELETE | `/restaurants/:id/products/:pId` | restaurant_owner | Remover produto |
| POST | `/restaurants/:id/products/:pId/image` | restaurant_owner | Upload imagem do produto |
| GET | `/restaurants/:id/products/featured` | público | Produtos em destaque |
| POST | `/restaurants/:id/products/:pId/ratings` | customer | Avaliar produto (após DELIVERED) |
| GET | `/restaurants/:id/products/:pId/ratings` | público | Avaliações do produto |
| GET | `/restaurants/:id/products/:pId` | público | Detalhe + totalMinutes (preparo+entrega) |
| POST | `/restaurants/:id/reviews` | customer | Avaliar restaurante (após DELIVERED) |
| GET | `/restaurants/:id/reviews` | público | Avaliações do restaurante |
| GET | `/restaurants/:id/payment-methods` | público | Métodos aceitos |
| PUT | `/restaurants/:id/payment-methods` | restaurant_owner | Atualizar métodos aceitos |
| POST | `/restaurants/:id/favorite` | customer | Toggle favorito |
| GET | `/restaurants/:id/favorite` | customer | Verificar se favoritado |
| POST | `/restaurants/:id/images/logo` | restaurant_owner | Upload logo |
| POST | `/restaurants/:id/images/banner` | restaurant_owner | Upload banner |
| GET | `/restaurants/:id/addresses` | público | Endereços estruturados |
| POST | `/restaurants/:id/addresses` | restaurant_owner | Adicionar endereço |
| POST | `/restaurants/:rId/products/:pId/option-groups` | restaurant_owner | Criar grupo de opções |
| GET | `/restaurants/:rId/products/:pId/option-groups` | público | Grupos de opções ativos |
| PATCH | `/restaurants/:rId/products/:pId/option-groups/:gId` | restaurant_owner | Atualizar grupo |
| DELETE | `/restaurants/:rId/products/:pId/option-groups/:gId` | restaurant_owner | Remover grupo |
| POST | `/restaurants/:rId/products/:pId/option-groups/:gId/options` | restaurant_owner | Criar opção |
| PATCH | `/restaurants/:rId/products/:pId/option-groups/:gId/options/:oId` | restaurant_owner | Atualizar opção |
| DELETE | `/restaurants/:rId/products/:pId/option-groups/:gId/options/:oId` | restaurant_owner | Remover opção |

### Drivers
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/drivers` | JWT | Criar perfil |
| GET | `/drivers/:id` | JWT | Buscar perfil |
| PATCH | `/drivers/:id` | driver | Atualizar |
| PATCH | `/drivers/:id/location` | driver | Atualizar posição |
| PATCH | `/drivers/:id/availability` | driver | Ligar/desligar disponibilidade |

### Orders
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/orders` | customer | Criar pedido (rate limit 10/min) |
| GET | `/orders/my` | customer | Meus pedidos (paginado) |
| GET | `/orders/restaurant/:id` | restaurant_owner | Pedidos do restaurante |
| GET | `/orders/:id` | JWT | Detalhe com itens + opções + valores |
| PATCH | `/orders/:id/status` | JWT | Avançar estado da máquina |
| DELETE | `/orders/:id` | customer | Cancelar (somente pending) |

### Payments
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/payments` | customer | Iniciar pagamento |
| POST | `/payments/:id/confirm` | público (mock) | Confirmar pagamento |
| POST | `/payments/:id/fail` | público (mock) | Reprovar pagamento |
| GET | `/payments/order/:orderId` | JWT | Pagamento do pedido |
| GET | `/payments/:id` | JWT | Detalhe do pagamento |
| POST | `/payment-methods` | admin | Criar método |
| GET | `/payment-methods` | público | Listar métodos |
| GET | `/payment-methods/:id` | público | Detalhe |
| PATCH | `/payment-methods/:id` | admin | Atualizar |
| DELETE | `/payment-methods/:id` | admin | Remover |

### Deliveries
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/deliveries` | restaurant_owner | Iniciar entrega (trigger matching) |
| GET | `/deliveries/driver/my` | driver | Minhas entregas |
| GET | `/deliveries/order/:orderId` | JWT | Entrega do pedido |
| GET | `/deliveries/:id` | JWT | Detalhe |
| PATCH | `/deliveries/:id/status` | driver | Atualizar status (picked_up / delivered) |
| GET | `/deliveries/:orderId/location` | JWT | Última posição conhecida (Redis) |

### Tags / Categorias
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/tags` | admin | Criar tag |
| GET | `/tags` | público | Listar (?scope=restaurant\|product) |
| GET | `/tags/:id` | público | Detalhe |
| PATCH | `/tags/:id` | admin | Atualizar |
| DELETE | `/tags/:id` | admin | Desativar (soft) |
| POST | `/restaurants/:id/tags` | admin | Atribuir tags ao restaurante |
| DELETE | `/restaurants/:id/tags/:tagId` | admin | Remover tag do restaurante |
| GET | `/restaurants/:id/tags` | público | Tags do restaurante |
| POST | `/restaurants/:rId/products/:pId/tags` | admin | Atribuir tags ao produto |
| DELETE | `/restaurants/:rId/products/:pId/tags/:tagId` | admin | Remover tag do produto |
| GET | `/restaurants/:rId/products/:pId/tags` | público | Tags do produto |
| GET | `/tags/:slug/restaurants` | público | Restaurantes com essa tag (paginado) |
| GET | `/tags/:slug/products` | público | Produtos com essa tag (paginado) |
| GET | `/products/cuisine/:origin` | público | Produtos por origem culinária |

### Location
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/location/geocode` | JWT | Geocodificar endereço → lat/lng |
| GET | `/location/restaurants` | público | Restaurantes por cidade/estado |

### Health
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | público | Status da API + DB |

---

## 6. WebSocket — Socket.IO

### Autenticação
Token JWT no handshake: `socket.handshake.auth.token` ou header `Authorization: Bearer <token>`

### Auto-join ao conectar
| Role | Room automática |
|---|---|
| customer | `customer:{userId}` |
| restaurant_owner | `restaurant:{userId}` |
| driver | `driver:{userId}` |

### Eventos que o cliente ENVIA (emit)
| Evento | Payload | Descrição |
|---|---|---|
| `join:order` | `{ orderId }` | Entrar na room do pedido |
| `join:driver` | `{ driverId }` | Entrar na room do driver |
| `watch:restaurant` | `{ restaurantId }` | Assinar status do restaurante |
| `unwatch:restaurant` | `{ restaurantId }` | Cancelar assinatura |
| `driver:location` | `{ orderId, lat, lng }` | Driver envia posição (requer WsJwtGuard) |

### Eventos que o servidor EMITE (on)
| Evento | Room | Quando | Payload |
|---|---|---|---|
| `order:new` | `restaurant:{id}` | Novo pedido criado | `{ orderId, customerId, totalAmount, items }` |
| `order:update` | `customer:{id}` `restaurant:{id}` `order:{id}` | Status do pedido muda | `{ orderId, status, updatedAt }` |
| `delivery:request` | `driver:{id}` | Entrega atribuída | `{ deliveryId, orderId, pickupAddress, deliveryAddress, restaurantLat, restaurantLng }` |
| `location:update` | `order:{id}` | Driver envia localização | `{ lat, lng, driverId, timestamp }` |
| `restaurant:status` | `restaurant:{id}` `restaurant-status:{id}` | Restaurante abre/fecha | `{ restaurantId, isOpen, closedAt, closedMessage, scheduledReopenAt, activeOrdersCount? }` |
| `error` | client | Operação não autorizada | `{ message }` |

---

## 7. Redis — Chaves e TTLs

| Chave | TTL | Descrição |
|---|---|---|
| `restaurant:{id}` | 300s | Cache do objeto restaurante (usado no OrderService.create) |
| `restaurant:{id}:status` | sem TTL | Estado aberto/fechado — fonte de verdade rápida |
| `product:{id}:option-groups` | 300s | Cache dos grupos de opções (usado no GET público) |
| `product:{id}:detail` | 300s | Cache do detalhe do produto com totalMinutes |
| `user:{id}:online` | 300s | Presença do usuário (renovada ao emitir) |
| `driver:{id}:state` | sem TTL | Estado do driver: `available \| busy \| offline` |
| `drivers:geo` | sem TTL | GEO set global de posições dos drivers |
| `order:{id}:location` | 3600s | Última posição conhecida do pedido |
| `lock:{key}` | 30000ms | Lock distribuído (SET NX PX) |
| `rate:user:{id}:{endpoint}` | windowSeconds | Contador de rate limit |
| `geocode:{base64}` | 86400s | Cache de geocodificação (24h) |
| `tags:all` | 3600s | Cache da listagem de tags |

---

## 8. BullMQ — Filas

### Fila `delivery-matching`
| Job | Produzido por | Consumido por | Dados |
|---|---|---|---|
| `match-driver` | `DeliveryMatchingProducer` | `DeliveryMatchingProcessor` | `{ deliveryId, restaurantLat, restaurantLng, attempt }` |

**Retry manual** (negócio): até 5 tentativas com delay `attempt × 5s`
**Retry automático** (infra): 3× exponential backoff (Redis down, crash)

### Fila `notifications`
| Job | Produzido por | Consumido por | Dados |
|---|---|---|---|
| `notify-order-status` | `NotificationsProducer` | `NotificationsProcessor` | `{ orderId, customerId, status }` |
| `notify-delivery-request` | `NotificationsProducer` | `NotificationsProcessor` | `{ deliveryId, driverId }` |
| `notify-no-driver` | `NotificationsProducer` | `NotificationsProcessor` | `{ deliveryId, restaurantId }` |

---

## 9. Algoritmo de Matching de Driver

```
Raio inicial: 3 km → 6 → 9 → 12 → 15 km (MAX)
Para cada raio:
  1. GEOSEARCH drivers:geo BYRADIUS {radius} km ASC COUNT 20
  2. Buscar no DB apenas isAvailable=true dos IDs retornados
  3. Calcular score: (1/distanceKm)*0.6 + (rating/5)*0.4
  4. Ordenar por score DESC
  5. Para cada candidato: tentar SET lock:driver:{id} NX PX 30000
     - Lock adquirido → atribuir e retornar
     - Lock falhou → próximo candidato
Sem driver após 15 km → fila tenta novamente (até 5 vezes)
```

---

## 10. Automação de Horário (Cron)

`RestaurantScheduleService` roda `@Cron(EVERY_MINUTE)`:

1. **Reabertura agendada**: busca `isOpen=false AND scheduledReopenAt <= now()` → abre, limpa campos, emite Socket.IO
2. **Horário diário**: para cada restaurante com `openingTime` ou `closingTime`:
   - Compara `HH:MM` atual (no `timezone` do restaurante) com os horários configurados
   - Fecha automaticamente ao atingir `closingTime`
   - Abre automaticamente ao atingir `openingTime` (se não tiver `scheduledReopenAt` pendente)

---

## 11. Regras de negócio críticas

### Pedidos
- `isOpen` verificado **somente em `create()`** — pedidos existentes são garantidos mesmo após fechamento
- Snapshot imutável: `productName`, `productPrice`, `deliveryFee`, `optionGroupName`, `optionName`, `priceModifier`
- `totalAmount = itemsTotal + deliveryFee` — nunca recalculado
- Rate limit em `POST /orders`: 10 req/min por usuário (`rate:user:{id}:orders`)

### Restaurante
- Fechar NÃO cancela pedidos em andamento — apenas bloqueia novos
- `setStatus(false)` grava `closedAt = now()` + invalida cache + atualiza chave Redis de status
- `setDeliveryFee` e `setOperatingHours` sempre invalidam o cache Redis

### Entrega
- Lock distribuído antes de qualquer atualização de driver — nunca dupla atribuição
- Lock liberado no `finally` — sem vazamento mesmo com exceção
- Ao finalizar entrega: `isAvailable = true` no banco E no Redis

### Avaliações
- `RestaurantReview`: única por `(customerId, orderId)` — pedido deve estar `DELIVERED`
- `ProductRating`: única por `(customerId, orderItemId)` — pedido deve estar `DELIVERED`
- `averageRating` recalculado via SQL após cada review/rating

### Upload de imagens
- Imagem anterior deletada no storage antes de gravar a nova URL
- Keys geradas com UUID — nunca usar nome original (segurança + colisão)
- Validação por MIME type, não por extensão
- `STORAGE_PROVIDER=local` (dev) ou `s3` (prod) — sem alteração no código consumidor

---

## 12. Variáveis de ambiente

```env
# App
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000

# Banco de dados
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/delivery

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=                   # min 32 chars
JWT_EXPIRES_IN=7d

# Email (SMTP)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=
MAIL_PASS=
MAIL_FROM="Delivery App" <noreply@delivery.app>

# Storage
STORAGE_PROVIDER=local        # local | s3
STORAGE_BUCKET=               # prod
STORAGE_REGION=us-east-1      # prod
STORAGE_ACCESS_KEY_ID=        # prod
STORAGE_SECRET_ACCESS_KEY=    # prod
STORAGE_PUBLIC_URL=           # prod (CDN ou bucket URL)
STORAGE_ENDPOINT=             # prod opcional (R2, MinIO)
```

---

## 13. Tags padrão do sistema

| Tag | Slug | Scope | Automática | Critério |
|---|---|---|---|---|
| Popular | `popular` | restaurant | sim | totalOrders > 50 |
| Fast Delivery | `fast_delivery` | restaurant | sim | estimatedDeliveryMinutes ≤ 30 |
| High Class | `high_class` | restaurant | não | atribuição manual admin |
| Dine In | `dine_in` | restaurant | não | atribuição manual admin |
| Pick Up | `pick_up` | restaurant | não | atribuição manual admin |
| Nearest | `nearest` | restaurant | sim | calculado por GEO |
| Popular (produto) | `popular_product` | product | sim | totalRatings alto |
| Recommended | `recommended` | product | não | manual admin |
| Vegan | `vegan` | product | não | manual admin |
| Spicy | `spicy` | product | não | manual admin |
| Gluten Free | `gluten_free` | product | não | manual admin |
| New | `new` | product | não | manual admin |

---

## 14. Estrutura de pastas (`src/`)

```
src/
├── main.ts                          # Bootstrap, CORS, prefix api/v1, pipes, filters
├── app.module.ts                    # Importa todos os módulos
├── config/
│   ├── database.config.ts
│   ├── data-source.ts               # CLI TypeORM
│   ├── env.validation.ts            # Joi schema
│   └── logger.config.ts             # Winston
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   ├── roles.decorator.ts
│   │   └── rate-limit.decorator.ts
│   ├── dto/
│   │   └── pagination.dto.ts
│   ├── enums/
│   │   ├── order-status.enum.ts
│   │   ├── delivery-status.enum.ts
│   │   └── payment-status.enum.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   ├── ws-jwt.guard.ts
│   │   └── rate-limit.guard.ts
│   ├── interceptors/
│   │   └── request-logger.interceptor.ts
│   ├── interfaces/
│   │   └── paginated-result.interface.ts
│   └── test/
│       └── mock-repository.helper.ts
├── database/
│   ├── migrations/
│   └── seeds/
│       └── tags.seed.ts
└── modules/
    ├── auth/         strategies/, dto/, interfaces/
    ├── category/     entities/, dto/
    ├── delivery/     entities/, dto/, matching.service.ts, tracking.service.ts
    ├── driver/       entities/, dto/
    ├── events/       types/, events.gateway.ts, events.service.ts
    ├── health/
    ├── location/     entities/, dto/
    ├── order/        entities/, dto/, constants/
    ├── payment/      entities/, dto/
    ├── queue/        constants/, producers/, processors/
    ├── redis/
    ├── restaurant/   entities/, dto/, utils/, interfaces/
    │                 product-option.service.ts
    │                 restaurant-schedule.service.ts
    ├── storage/      utils/
    └── user/         entities/, dto/
```

---

## 15. Dependências entre agentes (ordem de implementação)

```
E1 Setup
 └── E2 Database
      └── E-Storage (antes de E3)
           └── E3 Restaurant/User/Driver
                └── E4 Auth
                     └── E5 Orders ←── E7 Redis (paralelo E5/E6)
                          └── E6 Payment
                               └── E8 Delivery ←── E7
                                    └── E9 Queues ←── E7
                                         └── E10 Realtime (WebSocket+Tracking)
                                              └── E11 Observability
                                                   └── E12 Tests
                                                        └── E13 Docker Prod
                                                             └── E14 CI/CD

Extras (podem ser feitos após E5):
  E-Products  (após E3 + E5)
  E-Categories (após E3 + E-Products)
  E-Location  (após E2 + E7)
```

---

## 16. Checklist de implementação

### Cadeia principal
- [ ] E1 — Setup, prefixo `api/v1`, Dockerfile.dev, health check
- [ ] E2 — Todas as 19 entidades + ENUMs + migration
- [ ] E-Storage — StorageModule @Global, LocalStorageService, S3StorageService
- [ ] E3 — Restaurant/User/Driver + extras + cron de horário
- [ ] E4 — Auth JWT + forgot/reset password + email
- [ ] E7 — Redis (paralelo com E5/E6)
- [ ] E5 — Orders + product options + snapshots + deliveryFee
- [ ] E6 — Payment + métodos
- [ ] E8 — Delivery + matching GEO + locks
- [ ] E9 — BullMQ queues
- [ ] E10 — Socket.IO + tracking em tempo real
- [ ] E11 — Observabilidade + fix prefix + ValidationPipe + logger
- [ ] E12 — Testes unitários + e2e
- [ ] E13 — Docker multi-stage + compose prod
- [ ] E14 — CI/CD GitHub Actions

### Features extras
- [ ] E-Products — ratings, preparo, cuisineOrigin
- [ ] E-Categories — tags system
- [ ] E-Location — endereços estruturados + geocodificação
