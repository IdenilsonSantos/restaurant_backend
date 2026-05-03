---
name: e2-database
description: Etapa 2 — cria todas as entidades TypeORM, ENUMs, relacionamentos, índices e migration inicial do PostgreSQL. Inclui entidades de opções de produto e reviews de restaurante. Depende da E1.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 2 — Banco de Dados (Schema Completo).

## Pré-requisito
PR da E1 mergeado.

## Dependências
```bash
npm install @nestjs/typeorm typeorm pg
```

## Configuração TypeORM

`src/config/database.config.ts`:
```typescript
export default registerAs('database', () => ({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
}));
```

`src/config/data-source.ts` — DataSource para CLI do TypeORM (`migration:generate` / `migration:run`).

Atualizar `src/app.module.ts` para importar `TypeOrmModule.forRootAsync` com a config acima.

---

## ENUMs (`src/common/enums/`)

```typescript
// order-status.enum.ts
export enum OrderStatus {
  PENDING = 'pending', CONFIRMED = 'confirmed', PREPARING = 'preparing',
  READY = 'ready', PICKED_UP = 'picked_up', DELIVERED = 'delivered', CANCELLED = 'cancelled',
}

// delivery-status.enum.ts
export enum DeliveryStatus {
  WAITING = 'waiting', ASSIGNED = 'assigned', PICKED_UP = 'picked_up',
  DELIVERED = 'delivered', FAILED = 'failed',
}

// payment-status.enum.ts
export enum PaymentStatus {
  PENDING = 'pending', CONFIRMED = 'confirmed', FAILED = 'failed', REFUNDED = 'refunded',
}
```

---

## Entidades

### `user.entity.ts`
- id: uuid PK
- name, email (unique, @Index), passwordHash, phone: varchar
- role: enum `customer | restaurant_owner | driver | admin`
- resetPasswordToken (varchar, nullable), resetPasswordExpires (timestamp, nullable)
- createdAt, updatedAt
- Relacionamentos: orders (OneToMany → Order), driver (OneToOne → Driver)

### `restaurant.entity.ts`
- id: uuid PK
- ownerId (FK → users, @Index), name (@Index), description, address: varchar
- latitude, longitude: decimal(10,7)
- isOpen: boolean, default false
- closedAt (timestamp, nullable), closedMessage (varchar, nullable), scheduledReopenAt (timestamp, nullable)
- openingTime, closingTime: varchar(5), nullable — formato `HH:MM`
- timezone: varchar, default `America/Sao_Paulo`
- isFeatured: boolean, default false
- estimatedDeliveryMinutes: int, default 30
- averageRating: decimal(3,2), default 0 | totalReviews: int, default 0 | totalOrders: int, default 0
- logoUrl, bannerUrl: varchar, nullable
- deliveryFee: decimal(8,2), default 0
- createdAt, updatedAt
- Relacionamentos: owner (ManyToOne → User), products (OneToMany → Product), orders (OneToMany → Order), acceptedPaymentMethods (ManyToMany → PaymentMethod via `restaurant_payment_methods`)

### `product.entity.ts`
- id: uuid PK
- restaurantId (FK → restaurants, @Index), name, description: varchar
- price: decimal(10,2), imageUrl: nullable, isAvailable: boolean, default true
- createdAt, updatedAt
- Relacionamentos: restaurant (ManyToOne), orderItems (OneToMany), optionGroups (OneToMany → ProductOptionGroup)

### `restaurant-review.entity.ts`
- id: uuid PK
- restaurantId (@Index), customerId (@Index), orderId: uuid FK → orders
- rating: smallint 1–5, comment: text nullable
- createdAt
- @Unique(['customerId', 'orderId'])
- Relacionamentos: restaurant (ManyToOne), customer (ManyToOne → User), order (ManyToOne)

### `user-favorite-restaurant.entity.ts`
- userId, restaurantId: uuid — chave composta (@PrimaryColumn)
- createdAt
- @Index('IDX_favorite_user', ['userId']), @Index('IDX_favorite_restaurant', ['restaurantId'])
- Relacionamentos: user (ManyToOne ON DELETE CASCADE), restaurant (ManyToOne ON DELETE CASCADE)

### `product-option-group.entity.ts`
- id: uuid PK
- productId (FK → products, @Index, ON DELETE CASCADE)
- name: varchar, description: text nullable
- required: boolean default false
- minSelections: int default 0, maxSelections: int default 1
- isActive: boolean default true, displayOrder: int default 0
- createdAt, updatedAt
- Relacionamentos: product (ManyToOne), options (OneToMany → ProductOption, cascade, eager)

### `product-option.entity.ts`
- id: uuid PK
- groupId (FK → product_option_groups, @Index, ON DELETE CASCADE)
- name: varchar, priceModifier: decimal(10,2) default 0
- isAvailable: boolean default true, displayOrder: int default 0
- createdAt, updatedAt
- Relacionamentos: group (ManyToOne)

### `order.entity.ts`
- id: uuid PK
- customerId (@Index), restaurantId (@Index): FK
- status: enum OrderStatus, default pending, @Index
- itemsTotal: decimal(10,2) — soma dos subtotais
- deliveryFee: decimal(10,2) — **snapshot** da taxa no momento do pedido
- totalAmount: decimal(10,2) — `itemsTotal + deliveryFee`
- deliveryAddress: varchar, deliveryLatitude, deliveryLongitude: decimal(10,7)
- notes: text nullable
- createdAt, updatedAt
- Relacionamentos: customer (ManyToOne → User), restaurant (ManyToOne), items (OneToMany → OrderItem), delivery (OneToOne), payment (OneToOne)

### `order-item.entity.ts`
- id: uuid PK
- orderId (@Index), productId: FK
- productName: varchar snapshot, productPrice: decimal(10,2) snapshot
- quantity: int, subtotal: decimal(10,2)
- Relacionamentos: order (ManyToOne), product (ManyToOne), selectedOptions (OneToMany → OrderItemOption, cascade, eager)

### `order-item-option.entity.ts`
- id: uuid PK
- orderItemId (@Index, FK → order_items ON DELETE CASCADE)
- optionGroupId: uuid, optionGroupName: varchar snapshot
- optionId: uuid, optionName: varchar snapshot
- priceModifier: decimal(10,2) snapshot
- Relacionamentos: orderItem (ManyToOne)

### `driver.entity.ts`
- id: uuid PK
- userId (FK → users, unique), vehicleType, licensePlate: varchar
- rating: decimal(3,2) default 5.0, isAvailable: boolean default false, @Index
- currentLatitude, currentLongitude: decimal(10,7) nullable
- createdAt, updatedAt
- Relacionamentos: user (OneToOne → User), deliveries (OneToMany → Delivery)

### `delivery.entity.ts`
- id: uuid PK
- orderId (FK → orders, unique), driverId (FK → drivers, nullable, @Index)
- status: enum DeliveryStatus, default waiting, @Index
- pickedUpAt, deliveredAt: timestamp nullable
- createdAt, updatedAt
- Relacionamentos: order (OneToOne), driver (ManyToOne)

### `payment.entity.ts`
- id: uuid PK
- orderId (FK → orders, unique), amount: decimal(10,2)
- status: enum PaymentStatus, default pending, @Index
- method: varchar, externalId: nullable, confirmedAt: timestamp nullable
- createdAt, updatedAt
- Relacionamentos: order (OneToOne)

### `payment-method.entity.ts`
- id: uuid PK
- name: varchar, code: varchar unique, isActive: boolean default true
- createdAt, updatedAt

---

## Migration
```bash
npx typeorm migration:generate src/database/migrations/InitialSchema -d src/config/data-source.ts
npm run migration:run
```

## Commit
```bash
git checkout -b feat/e2-database-schema
git add src/modules/**/entities src/common/enums src/config/database.config.ts src/config/data-source.ts src/database
git commit -m "feat: add TypeORM entities, enums and initial migration"
```

## Regras
- `@Index` em todos os campos usados em filtros/joins frequentes
- Snapshots em `order_items` e `order_item_options` — imutáveis após criação
- `synchronize: false` sempre — nunca true em produção
- Não criar services ou controllers nesta etapa
