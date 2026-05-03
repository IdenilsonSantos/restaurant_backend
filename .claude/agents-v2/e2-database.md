---
name: e2-database
description: Etapa 2 — cria todas as entidades TypeORM, ENUMs, relacionamentos, índices e migration inicial do PostgreSQL. Inclui entidades de opções de produto (E5B) e reviews de restaurante (E3C). Depende da E1.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 2 — Banco de Dados (Schema Completo)**.

## Pré-requisito
PR da E1 mergeado na `main`.

## Dependências a instalar
```bash
npm install @nestjs/typeorm typeorm pg
```

## O que você deve criar

### 1. Configuração TypeORM

`src/config/database.config.ts`:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
}));
```

`src/config/data-source.ts` — datasource para CLI do TypeORM (usado em `migration:generate` e `migration:run`).

Atualizar `src/app.module.ts` para importar `TypeOrmModule.forRootAsync` usando a config acima.

---

### 2. ENUMs (`src/common/enums/`)

`order-status.enum.ts`:
```typescript
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  PICKED_UP = 'picked_up',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}
```

`delivery-status.enum.ts`:
```typescript
export enum DeliveryStatus {
  WAITING = 'waiting',
  ASSIGNED = 'assigned',
  PICKED_UP = 'picked_up',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}
```

`payment-status.enum.ts`:
```typescript
export enum PaymentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
```

---

### 3. Entidades principais

#### `src/modules/user/entities/user.entity.ts`
- id (uuid PK)
- name, email (unique, @Index), passwordHash, phone (varchar)
- role: enum `customer | restaurant_owner | driver | admin`
- createdAt, updatedAt
- Relacionamentos: orders (OneToMany → Order), driver (OneToOne → Driver)

#### `src/modules/restaurant/entities/restaurant.entity.ts`
- id (uuid PK)
- ownerId (FK → users, @Index), name (@Index), description, address (varchar)
- latitude, longitude (decimal 10,7)

**Status de funcionamento:**
- isOpen (boolean, default false) — estado atual (aberto/fechado)
- closedAt (timestamp, nullable) — quando foi fechado pela última vez (null se nunca fechou ou está aberto)
- closedMessage (varchar, nullable) — mensagem exibida ao usuário quando fechado ex: "Voltamos às 18h!", "Fechado hoje por feriado"
- scheduledReopenAt (timestamp, nullable) — data/hora de reabertura automática agendada (quando o dono programa a reabertura)

**Horário de funcionamento:**
- openingTime (varchar(5), nullable) — horário de abertura diário no formato "HH:MM" ex: "11:00"
- closingTime (varchar(5), nullable) — horário de fechamento diário no formato "HH:MM" ex: "22:30"
- timezone (varchar, default "America/Sao_Paulo") — fuso horário do restaurante para calcular abertura/fechamento

> `openingTime` e `closingTime` são usados pelo **cron job** para abrir/fechar automaticamente. `isOpen` é sempre a fonte de verdade do estado atual — os campos de horário apenas orientam a automação.

- isFeatured (boolean, default false)
- estimatedDeliveryMinutes (int, default 30)
- averageRating (decimal 3,2, default 0)
- totalReviews (int, default 0)
- totalOrders (int, default 0)
- logoUrl, bannerUrl (varchar, nullable)
- deliveryFee (decimal 8,2, default 0)
- createdAt, updatedAt
- Relacionamentos: owner (ManyToOne → User), products (OneToMany → Product), orders (OneToMany → Order), acceptedPaymentMethods (ManyToMany → PaymentMethod via `restaurant_payment_methods`)

#### `src/modules/restaurant/entities/product.entity.ts`
- id (uuid PK)
- restaurantId (FK → restaurants, @Index), name, description, price (decimal 10,2)
- imageUrl (nullable), isAvailable (boolean, default true)
- createdAt, updatedAt
- Relacionamentos: restaurant (ManyToOne), orderItems (OneToMany → OrderItem), optionGroups (OneToMany → ProductOptionGroup)

#### `src/modules/restaurant/entities/restaurant-review.entity.ts`
- id (uuid PK)
- restaurantId (@Index), customerId (@Index), orderId (uuid, FK → orders)
- rating (smallint, 1–5), comment (text, nullable)
- createdAt
- @Unique(['customerId', 'orderId']) — um review por cliente por pedido
- Relacionamentos: restaurant (ManyToOne), customer (ManyToOne → User), order (ManyToOne → Order)

#### `src/modules/restaurant/entities/user-favorite-restaurant.entity.ts`
- userId (uuid PK column), restaurantId (uuid PK column) — chave composta
- createdAt
- @Index('IDX_favorite_user', ['userId']), @Index('IDX_favorite_restaurant', ['restaurantId'])
- Relacionamentos: user (ManyToOne ON DELETE CASCADE), restaurant (ManyToOne ON DELETE CASCADE)

#### `src/modules/restaurant/entities/product-option-group.entity.ts`
- id (uuid PK)
- productId (FK → products, @Index, ON DELETE CASCADE)
- name (varchar), description (text, nullable)
- required (boolean, default false)
- minSelections (int, default 0), maxSelections (int, default 1)
- isActive (boolean, default true), displayOrder (int, default 0)
- createdAt, updatedAt
- Relacionamentos: product (ManyToOne), options (OneToMany → ProductOption, cascade, eager)

#### `src/modules/restaurant/entities/product-option.entity.ts`
- id (uuid PK)
- groupId (FK → product_option_groups, @Index, ON DELETE CASCADE)
- name (varchar), priceModifier (decimal 10,2, default 0)
- isAvailable (boolean, default true), displayOrder (int, default 0)
- createdAt, updatedAt
- Relacionamentos: group (ManyToOne)

#### `src/modules/order/entities/order.entity.ts`
- id (uuid PK)
- customerId (@Index), restaurantId (@Index) (FK → users/restaurants)
- status (enum OrderStatus, default pending, @Index)
- itemsTotal (decimal 10,2) — soma dos subtotais dos itens (sem taxa de entrega)
- deliveryFee (decimal 10,2, default 0) — **snapshot** da taxa do restaurante no momento do pedido
- totalAmount (decimal 10,2) — `itemsTotal + deliveryFee` — valor total cobrado
- deliveryAddress (varchar), deliveryLatitude, deliveryLongitude (decimal 10,7)
- notes (text, nullable)
- createdAt, updatedAt
- Relacionamentos: customer (ManyToOne → User), restaurant (ManyToOne → Restaurant), items (OneToMany → OrderItem), delivery (OneToOne → Delivery), payment (OneToOne → Payment)

> **Regra de snapshot**: `deliveryFee` no pedido é imutável após a criação — mesmo que o restaurante mude sua taxa depois, o valor cobrado permanece o que estava vigente no momento do pedido.

#### `src/modules/order/entities/order-item.entity.ts`
- id (uuid PK)
- orderId (@Index), productId (FK → products)
- productName (varchar) — snapshot, productPrice (decimal 10,2) — snapshot
- quantity (int), subtotal (decimal 10,2)
- Relacionamentos: order (ManyToOne), product (ManyToOne), selectedOptions (OneToMany → OrderItemOption, cascade, eager)

#### `src/modules/order/entities/order-item-option.entity.ts`
- id (uuid PK)
- orderItemId (@Index, FK → order_items ON DELETE CASCADE)
- optionGroupId (uuid), optionGroupName (varchar) — snapshot do grupo
- optionId (uuid), optionName (varchar) — snapshot da opção
- priceModifier (decimal 10,2, default 0) — snapshot
- Relacionamentos: orderItem (ManyToOne)

#### `src/modules/driver/entities/driver.entity.ts`
- id (uuid PK)
- userId (FK → users, unique)
- vehicleType, licensePlate (varchar)
- rating (decimal 3,2, default 5.0)
- isAvailable (boolean, default false, @Index)
- currentLatitude, currentLongitude (decimal 10,7, nullable)
- createdAt, updatedAt
- Relacionamentos: user (OneToOne → User), deliveries (OneToMany → Delivery)

#### `src/modules/delivery/entities/delivery.entity.ts`
- id (uuid PK)
- orderId (FK → orders, unique)
- driverId (FK → drivers, nullable, @Index)
- status (enum DeliveryStatus, default waiting, @Index)
- pickedUpAt, deliveredAt (timestamp, nullable)
- createdAt, updatedAt
- Relacionamentos: order (OneToOne → Order), driver (ManyToOne → Driver)

#### `src/modules/payment/entities/payment.entity.ts`
- id (uuid PK)
- orderId (FK → orders, unique)
- amount (decimal 10,2)
- status (enum PaymentStatus, default pending, @Index)
- method (varchar), externalId (nullable), confirmedAt (timestamp, nullable)
- createdAt, updatedAt
- Relacionamentos: order (OneToOne → Order)

#### `src/modules/payment/entities/payment-method.entity.ts`
- id (uuid PK)
- name (varchar), code (varchar, unique), isActive (boolean, default true)
- createdAt, updatedAt

---

### 4. Migration inicial
```bash
npx typeorm migration:generate src/database/migrations/InitialSchema -d src/config/data-source.ts
npm run migration:run
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e2-database-schema
git add src/modules/**/entities src/common/enums src/config/database.config.ts src/config/data-source.ts src/database
git commit -m "feat: add TypeORM entities, enums and initial migration"
git push origin feat/e2-database-schema
gh pr create \
  --title "feat: E2 - Database schema" \
  --base main \
  --body "## O que foi feito
- Entidades: users, restaurants, products, restaurant_reviews, user_favorite_restaurants, product_option_groups, product_options, orders, order_items, order_item_options, drivers, deliveries, payments, payment_methods
- ENUMs: OrderStatus, DeliveryStatus, PaymentStatus
- Relacionamentos e índices estratégicos
- Migration inicial gerada

## Depende de
PR E1 mergeado

## Como testar
\`\`\`bash
npm run migration:run
\`\`\`"
```

## Regras
- Usar `@Index` em todos os campos usados em filtros/joins frequentes
- Snapshots em `order_items` e `order_item_options` — imutáveis após criação
- Nunca usar `synchronize: true` em produção
- Não criar services ou controllers nesta etapa — apenas entidades
