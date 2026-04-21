---
name: delivery-e2-database
description: Etapa 2 do sistema de delivery — cria todas as entidades TypeORM, ENUMs, relacionamentos, índices e migrations do PostgreSQL. Depende da Etapa 1 (projeto NestJS iniciado). Use após o PR da E1 ser mergeado.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 2 — Banco de Dados (Schema PostgreSQL)** do sistema de delivery.

## Pré-requisito
O projeto NestJS da Etapa 1 deve estar mergeado na branch `main`.

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

Atualizar `src/app.module.ts` para importar `TypeOrmModule.forRootAsync` usando a config.

### 2. ENUMs
`src/common/enums/order-status.enum.ts`:
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

`src/common/enums/delivery-status.enum.ts`:
```typescript
export enum DeliveryStatus {
  WAITING = 'waiting',
  ASSIGNED = 'assigned',
  PICKED_UP = 'picked_up',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}
```

`src/common/enums/payment-status.enum.ts`:
```typescript
export enum PaymentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
```

### 3. Entidades

`src/modules/user/entities/user.entity.ts`:
- id (uuid, PK)
- name (varchar)
- email (varchar, unique, index)
- passwordHash (varchar)
- phone (varchar)
- role (enum: customer | restaurant_owner | driver | admin)
- createdAt, updatedAt
- Relacionamentos: orders (OneToMany), driver (OneToOne)

`src/modules/restaurant/entities/restaurant.entity.ts`:
- id (uuid, PK)
- ownerId (FK → users)
- name (varchar, index)
- description (text)
- address (varchar)
- latitude (decimal 10,7)
- longitude (decimal 10,7)
- isOpen (boolean, default false)
- createdAt, updatedAt
- Relacionamentos: owner (ManyToOne), products (OneToMany), orders (OneToMany)

`src/modules/restaurant/entities/product.entity.ts`:
- id (uuid, PK)
- restaurantId (FK → restaurants, index)
- name (varchar)
- description (text)
- price (decimal 10,2)
- imageUrl (varchar, nullable)
- isAvailable (boolean, default true)
- createdAt, updatedAt
- Relacionamentos: restaurant (ManyToOne), orderItems (OneToMany)

`src/modules/order/entities/order.entity.ts`:
- id (uuid, PK)
- customerId (FK → users, index)
- restaurantId (FK → restaurants, index)
- status (enum OrderStatus, default pending, index)
- totalAmount (decimal 10,2)
- deliveryAddress (varchar)
- deliveryLatitude (decimal 10,7)
- deliveryLongitude (decimal 10,7)
- notes (text, nullable)
- createdAt, updatedAt
- Relacionamentos: customer (ManyToOne), restaurant (ManyToOne), items (OneToMany), delivery (OneToOne), payment (OneToOne)

`src/modules/order/entities/order-item.entity.ts`:
- id (uuid, PK)
- orderId (FK → orders, index)
- productId (FK → products)
- productName (varchar) — snapshot
- productPrice (decimal 10,2) — snapshot
- quantity (int)
- subtotal (decimal 10,2)
- Relacionamentos: order (ManyToOne), product (ManyToOne)

`src/modules/driver/entities/driver.entity.ts`:
- id (uuid, PK)
- userId (FK → users, unique)
- vehicleType (varchar)
- licensePlate (varchar)
- rating (decimal 3,2, default 5.0)
- isAvailable (boolean, default false, index)
- currentLatitude (decimal 10,7, nullable)
- currentLongitude (decimal 10,7, nullable)
- createdAt, updatedAt
- Relacionamentos: user (OneToOne), deliveries (OneToMany)

`src/modules/delivery/entities/delivery.entity.ts`:
- id (uuid, PK)
- orderId (FK → orders, unique)
- driverId (FK → drivers, nullable, index)
- status (enum DeliveryStatus, default waiting, index)
- pickedUpAt (timestamp, nullable)
- deliveredAt (timestamp, nullable)
- createdAt, updatedAt
- Relacionamentos: order (OneToOne), driver (ManyToOne)

`src/modules/payment/entities/payment.entity.ts`:
- id (uuid, PK)
- orderId (FK → orders, unique)
- amount (decimal 10,2)
- status (enum PaymentStatus, default pending, index)
- method (varchar)
- externalId (varchar, nullable)
- confirmedAt (timestamp, nullable)
- createdAt, updatedAt
- Relacionamentos: order (OneToOne)

### 4. Migration inicial
```bash
npx typeorm migration:generate src/database/migrations/InitialSchema -d src/config/data-source.ts
```

Criar `src/config/data-source.ts` para CLI do TypeORM.

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e2-database-schema`
3. Criar todos os arquivos
4. `git add src/modules/**/entities src/common/enums src/config/database.config.ts src/config/data-source.ts src/database`
5. `git commit -m "feat: add TypeORM entities, enums and initial migration"`
6. `git push origin feat/e2-database-schema`
7. `gh pr create --title "feat: E2 - Database schema" --base main --body "## O que foi feito\n- Entidades TypeORM: users, restaurants, products, orders, order_items, drivers, deliveries, payments\n- ENUMs: OrderStatus, DeliveryStatus, PaymentStatus\n- Relacionamentos e índices estratégicos\n- Migration inicial gerada\n\n## Depende de\nPR E1 mergeado\n\n## Como testar\n\`\`\`bash\nnpm run migration:run\n\`\`\`"`

## Regras
- Usar `@Index` nos campos que serão usados em filtros/joins frequentes
- Snapshots de produto em `order_items` (name e price) para preservar histórico
- Não criar services ou controllers — apenas entidades
