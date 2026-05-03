---
name: e3-restaurant
description: Etapa 3 — cria RestaurantModule, UserModule e DriverModule com CRUD completo incluindo busca avançada por distância (Haversine), avaliações, favoritos, métodos de pagamento e upload de imagem via StorageModule. Fusão das antigas E3 e E3C. Depende da E2 e E-Storage.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 3 — Módulos Base + Restaurant Extras**.

## Pré-requisito
PRs das E1, E2 e **E-Storage** mergeados na `main`. O `StorageModule` já está disponível globalmente — basta injetar `StorageService` sem importar o módulo. As entidades já existem.

## Dependências a instalar
```bash
npm install bcrypt
npm install -D @types/bcrypt @types/multer
```

---

## Parte A — UserModule (`src/modules/user/`)

**DTOs:**
- `create-user.dto.ts`: name, email, password (min 8), phone, role
- `update-user.dto.ts`: PartialType sem password

**user.service.ts:**
- `create(dto)` — hash de password com bcrypt; nunca retornar passwordHash
- `findOne(id)` — NotFoundException se não encontrar
- `findByEmail(email)` — usado pelo AuthModule
- `update(id, dto)`, `remove(id)`

**user.controller.ts:** `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id`
> POST de usuário será feito pelo AuthModule na E4.

---

## Parte B — DriverModule (`src/modules/driver/`)

**DTOs:**
- `create-driver.dto.ts`: userId, vehicleType, licensePlate
- `update-driver.dto.ts`: PartialType + isAvailable, currentLatitude, currentLongitude
- `update-location.dto.ts`: lat, lng
- `update-availability.dto.ts`: isAvailable (boolean)

**driver.service.ts:**
- `create(dto)`, `findOne(id)`, `findByUserId(userId)`, `update(id, dto)`
- `updateLocation(id, lat, lng)` — atualiza coordenadas atuais
- `setAvailability(id, available)` — liga/desliga disponibilidade

**driver.controller.ts:**
- `POST /drivers`, `GET /drivers/:id`, `PATCH /drivers/:id`
- `PATCH /drivers/:id/location`, `PATCH /drivers/:id/availability`

---

## Parte C — Common — Paginação

`src/common/dto/pagination.dto.ts`:
```typescript
export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 10;
}
```

`src/common/interfaces/paginated-result.interface.ts`:
```typescript
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

---

## Parte D — RestaurantModule — CRUD Base (`src/modules/restaurant/`)

**DTOs base:**
- `create-restaurant.dto.ts`: name, description, address, latitude, longitude, deliveryFee (opcional, default 0)
- `update-restaurant.dto.ts`: PartialType de CreateRestaurantDto
- `create-product.dto.ts`: restaurantId, name, description, price, imageUrl (opcional)
- `update-product.dto.ts`: PartialType de CreateProductDto

**restaurant.service.ts — métodos base:**
- `create(dto)`, `findAll(page, limit)` (paginado), `findOne(id)` (NotFoundException)
- `update(id, dto)`, `remove(id)`
- `createProduct(dto)`, `findProducts(restaurantId)` — apenas disponíveis
- `updateProduct(id, dto)`, `removeProduct(id)`

**Endpoints base:**
```
POST   /restaurants
GET    /restaurants?page=1&limit=10
GET    /restaurants/:id
PATCH  /restaurants/:id
DELETE /restaurants/:id
POST   /restaurants/:id/products
GET    /restaurants/:id/products
PATCH  /restaurants/:id/products/:productId
DELETE /restaurants/:id/products/:productId
```

> IMPORTANTE: rotas literais (`/search`, `/featured`, `/nearby`, `/fastest`, `/favorites/my`)
> DEVEM vir **antes** de `GET :id` no controller para evitar conflito de rota.

---

## Parte E — Utilitário Haversine

`src/modules/restaurant/utils/haversine.util.ts`:
```typescript
const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}
```

---

## Parte F — DTOs de busca avançada

`nearby-restaurant.dto.ts`: lat, lng obrigatórios; radiusKm (default 5, max 50); limit (default 10); onlyOpen (boolean, default false)

`search-restaurant.dto.ts` extends PaginationDto: onlyOpen?, featured?, maxDeliveryMinutes?, lat?, lng?, radiusKm?, sortBy?: `'distance' | 'delivery' | 'rating' | 'featured'`

`create-review.dto.ts`: orderId (UUID), rating (int 1–5), comment (opcional)

`paginated-reviews.dto.ts` extends PaginationDto: minRating (opcional)

`update-payment-methods.dto.ts`: paymentMethodIds (UUID[], min 1)

`set-delivery-fee.dto.ts`: deliveryFee (number >= 0), isFreeDelivery (boolean, opcional)

---

## Parte G — Interface enriquecida

`src/modules/restaurant/interfaces/restaurant-with-distance.interface.ts`:
```typescript
import { Restaurant } from '../entities/restaurant.entity';
export interface RestaurantWithDistance extends Restaurant {
  distanceKm?: number;
  adjustedDeliveryMinutes?: number;
}
```

---

## Parte H — restaurant.service.ts — métodos extras

O `RestaurantService` deve injetar repositórios de: `Restaurant`, `Product`, `RestaurantReview`, `Order`, `PaymentMethod`, `UserFavoriteRestaurant`. Também injeta `StorageService`.

### H.1 Busca avançada
```typescript
async search(dto: SearchRestaurantDto): Promise<PaginatedResult<RestaurantWithDistance>>
```
- Filtros DB: onlyOpen, featured, maxDeliveryMinutes
- Enriquece com distância Haversine se lat/lng fornecidos
- Filtra por raio se radiusKm fornecido
- Ordena por: distance | delivery | rating | featured
- Pagina em memória

```typescript
async findFeatured(): Promise<RestaurantWithDistance[]>
// WHERE isFeatured=true AND isOpen=true ORDER BY totalOrders DESC LIMIT 10

async findNearby(dto: NearbyRestaurantDto): Promise<RestaurantWithDistance[]>
// Haversine em memória, filtra por raio, ordena por distância crescente

async findByDeliveryTime(lat?, lng?, limit = 10): Promise<RestaurantWithDistance[]>
// Ordena por adjustedDeliveryMinutes (estimado + ceil(distancia*2))
```

### H.2 Avaliações
```typescript
async createReview(restaurantId: string, customerId: string, dto: CreateReviewDto): Promise<RestaurantReview>
```
- Verificar que o `orderId` pertence ao cliente E ao restaurante
- Verificar que o pedido está `DELIVERED`
- Lançar `ConflictException` se já existir review (unique customerId+orderId)
- Após salvar: recalcular `averageRating` e `totalReviews` com subquery SQL

```typescript
async findReviews(restaurantId: string, dto: PaginatedReviewsDto): Promise<PaginatedResult<RestaurantReview>>
// leftJoin com customer, filtro minRating opcional, ORDER BY createdAt DESC
```

### H.3 Métodos de pagamento
```typescript
async findPaymentMethods(restaurantId: string): Promise<PaymentMethod[]>
// relations: ['acceptedPaymentMethods']

async updatePaymentMethods(restaurantId: string, ownerId: string, dto: UpdatePaymentMethodsDto): Promise<PaymentMethod[]>
// Verificar ownerId === restaurant.ownerId → ForbiddenException
// Verificar que todos os paymentMethodIds existem e estão ativos → BadRequestException
```

### H.4 Favoritos
```typescript
async toggleFavorite(restaurantId: string, userId: string): Promise<{ favorited: boolean }>
// Se existe → remove, retorna { favorited: false }
// Se não existe → cria, retorna { favorited: true }

async findFavorites(userId: string): Promise<Restaurant[]>
// relations: ['restaurant'], ORDER BY createdAt DESC

async isFavorited(restaurantId: string, userId: string): Promise<{ favorited: boolean }>
```

### H.5 Taxa de entrega
```typescript
async setDeliveryFee(restaurantId: string, dto: SetDeliveryFeeDto): Promise<Restaurant> {
  const restaurant = await this.findOne(restaurantId);
  restaurant.deliveryFee = dto.isFreeDelivery ? 0 : dto.deliveryFee;
  const saved = await this.restaurantRepository.save(restaurant);
  // Invalidar cache — pedidos novos devem capturar a nova taxa como snapshot
  await this.redisService.cacheDel(`restaurant:${restaurantId}`);
  return saved;
}
```

> **Importante**: sempre invalidar o cache Redis após alterar `deliveryFee`. O `OrderService.create()` usa o cache para montar o snapshot — se o cache estiver desatualizado, novos pedidos capturarão a taxa antiga.

---

### H.7 Abrir / Fechar restaurante (com efeito imediato)

Adicionar DTO `src/modules/restaurant/dto/set-restaurant-status.dto.ts`:
```typescript
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class SetRestaurantStatusDto {
  @IsBoolean()
  isOpen: boolean;

  /** Mensagem exibida ao cliente enquanto o restaurante estiver fechado */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  closedMessage?: string;

  /**
   * Data/hora ISO 8601 de reabertura automática.
   * Ex: "2025-12-25T18:00:00-03:00"
   * Se fornecido, um cron job reabrirá o restaurante automaticamente nesta hora.
   */
  @IsOptional()
  @IsDateString()
  scheduledReopenAt?: string;
}
```

Adicionar DTO `src/modules/restaurant/dto/set-operating-hours.dto.ts`:
```typescript
import { IsOptional, IsString, IsTimeZone, Matches } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM

export class SetOperatingHoursDto {
  /** Horário de abertura diário ex: "11:00". Null = sem abertura automática. */
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'openingTime deve estar no formato HH:MM' })
  openingTime?: string | null;

  /** Horário de fechamento diário ex: "22:30". Null = sem fechamento automático. */
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'closingTime deve estar no formato HH:MM' })
  closingTime?: string | null;

  /** Fuso horário IANA ex: "America/Sao_Paulo", "America/Manaus" */
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
```

Adicionar ao `RestaurantService` (injetar `EventsService` via `forwardRef` e `OrderRepository`):
```typescript
async setStatus(
  restaurantId: string,
  ownerId: string,
  dto: SetRestaurantStatusDto,
): Promise<{
  isOpen: boolean;
  activeOrdersCount: number;  // pedidos em andamento que serão concluídos normalmente
}> {
  const restaurant = await this.findOne(restaurantId);
  if (restaurant.ownerId !== ownerId) throw new ForbiddenException();

  // Contar pedidos em andamento ANTES de fechar (para informar o dono)
  const activeOrdersCount = dto.isOpen ? 0 : await this.orderRepository.count({
    where: {
      restaurantId,
      status: In([
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY,
        OrderStatus.PICKED_UP,
      ]),
    },
  });

  restaurant.isOpen          = dto.isOpen;
  restaurant.closedAt        = dto.isOpen ? null : new Date();
  restaurant.closedMessage   = dto.isOpen ? null : (dto.closedMessage ?? null);
  restaurant.scheduledReopenAt = dto.isOpen
    ? null
    : (dto.scheduledReopenAt ? new Date(dto.scheduledReopenAt) : null);

  await this.restaurantRepository.save(restaurant);

  // 1. Atualizar chave de status (sem TTL) — bloqueio imediato de novos pedidos
  await this.redisService.setRestaurantOpen(restaurantId, dto.isOpen);

  // 2. Invalidar cache do objeto completo — próximas leituras buscam no DB
  await this.redisService.cacheDel(`restaurant:${restaurantId}`);

  // 3. Propagar mudança em tempo real via Socket.IO
  this.eventsService.emitRestaurantStatus(restaurantId, {
    restaurantId,
    isOpen: dto.isOpen,
    closedAt: restaurant.closedAt?.toISOString() ?? null,
    closedMessage: restaurant.closedMessage,
    scheduledReopenAt: restaurant.scheduledReopenAt?.toISOString() ?? null,
    activeOrdersCount,
    updatedAt: new Date().toISOString(),
  });

  return { isOpen: dto.isOpen, activeOrdersCount };
}
```

**Garantia de pedidos em andamento (regra fundamental):**
Fechar o restaurante **NÃO cancela nem interrompe** pedidos já criados. O `setStatus(false)` apenas:
- Bloqueia **novos** pedidos (via Redis + cache invalidado)
- Informa o dono quantos pedidos ainda estão em andamento

Pedidos com status `pending`, `confirmed`, `preparing`, `ready` ou `picked_up` continuam seu ciclo de vida normalmente — o restaurante deve processar e entregar todos antes de realmente "fechar".

**Por que invalidar o cache é crítico aqui:**
O `OrderService.create()` usa `cacheGet('restaurant:{id}')` antes de verificar o status. Se o cache não for invalidado, clientes conseguirão criar pedidos num restaurante já fechado por até 5 minutos (TTL do cache). A invalidação imediata elimina essa janela.

### H.8 Horário de funcionamento
```typescript
async setOperatingHours(
  restaurantId: string,
  ownerId: string,
  dto: SetOperatingHoursDto,
): Promise<Restaurant> {
  const restaurant = await this.findOne(restaurantId);
  if (restaurant.ownerId !== ownerId) throw new ForbiddenException();

  if (dto.openingTime  !== undefined) restaurant.openingTime  = dto.openingTime;
  if (dto.closingTime  !== undefined) restaurant.closingTime  = dto.closingTime;
  if (dto.timezone     !== undefined) restaurant.timezone     = dto.timezone;

  await this.restaurantRepository.save(restaurant);
  await this.redisService.cacheDel(`restaurant:${restaurantId}`);
  return restaurant;
}
```

Endpoint:
```
PATCH /restaurants/:id/operating-hours  → setOperatingHours (@Roles('restaurant_owner'))
```

Retorna o restaurante atualizado com `openingTime`, `closingTime` e `timezone` visíveis.

---

### H.9 Cron Service — Abertura/Fechamento automático

Criar `src/modules/restaurant/restaurant-schedule.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, LessThanOrEqual } from 'typeorm';
import { Restaurant } from './entities/restaurant.entity';
import { RedisService } from '../redis/redis.service';
import { EventsService } from '../events/events.service';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class RestaurantScheduleService {
  private readonly logger = new Logger(RestaurantScheduleService.name);

  constructor(
    @InjectRepository(Restaurant) private readonly restaurantRepo: Repository<Restaurant>,
    private readonly redisService: RedisService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Roda a cada minuto. Verifica dois cenários:
   * 1. Reabertura agendada (scheduledReopenAt <= agora)
   * 2. Abertura/fechamento pelo horário diário (openingTime / closingTime)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledEvents(): Promise<void> {
    await this.processScheduledReopens();
    await this.processDailySchedule();
  }

  private async processScheduledReopens(): Promise<void> {
    const now = new Date();
    const restaurants = await this.restaurantRepo.find({
      where: {
        isOpen: false,
        scheduledReopenAt: LessThanOrEqual(now),
      },
    });

    for (const r of restaurants) {
      r.isOpen = true;
      r.closedAt = null;
      r.closedMessage = null;
      r.scheduledReopenAt = null;
      await this.restaurantRepo.save(r);
      await this.redisService.setRestaurantOpen(r.id, true);
      await this.redisService.cacheDel(`restaurant:${r.id}`);
      this.eventsService.emitRestaurantStatus(r.id, {
        restaurantId: r.id,
        isOpen: true,
        closedAt: null,
        closedMessage: null,
        scheduledReopenAt: null,
        updatedAt: now.toISOString(),
      });
      this.logger.log(`Restaurant ${r.id} (${r.name}) auto-reopened via scheduledReopenAt`);
    }
  }

  private async processDailySchedule(): Promise<void> {
    // Buscar apenas restaurantes que têm horário configurado
    const restaurants = await this.restaurantRepo.find({
      where: [
        { openingTime: Not(IsNull()) },
        { closingTime: Not(IsNull()) },
      ],
    });

    for (const r of restaurants) {
      const tz = r.timezone ?? 'America/Sao_Paulo';
      const now = dayjs().tz(tz);
      const currentTime = now.format('HH:mm');

      const shouldBeOpen  = r.openingTime ? currentTime >= r.openingTime : null;
      const shouldBeClosed = r.closingTime ? currentTime >= r.closingTime : null;

      // Fechar automaticamente quando atingir closingTime
      if (shouldBeClosed === true && r.isOpen) {
        r.isOpen = false;
        r.closedAt = new Date();
        r.closedMessage = r.openingTime
          ? `Abrimos às ${r.openingTime}`
          : 'Voltamos em breve';
        await this.restaurantRepo.save(r);
        await this.redisService.setRestaurantOpen(r.id, false);
        await this.redisService.cacheDel(`restaurant:${r.id}`);
        this.eventsService.emitRestaurantStatus(r.id, {
          restaurantId: r.id,
          isOpen: false,
          closedAt: r.closedAt.toISOString(),
          closedMessage: r.closedMessage,
          scheduledReopenAt: null,
          updatedAt: new Date().toISOString(),
        });
        this.logger.log(`Restaurant ${r.id} (${r.name}) auto-closed at ${currentTime} (${tz})`);
      }

      // Abrir automaticamente quando atingir openingTime
      // Só abre se não houver scheduledReopenAt pendente (reabertura manual tem prioridade)
      if (shouldBeOpen === true && !r.isOpen && !r.scheduledReopenAt) {
        // Verificar que ainda não passou do closingTime (evitar reabrir um restaurante que fechou hoje)
        const stillOpen = r.closingTime ? currentTime < r.closingTime : true;
        if (stillOpen) {
          r.isOpen = true;
          r.closedAt = null;
          r.closedMessage = null;
          await this.restaurantRepo.save(r);
          await this.redisService.setRestaurantOpen(r.id, true);
          await this.redisService.cacheDel(`restaurant:${r.id}`);
          this.eventsService.emitRestaurantStatus(r.id, {
            restaurantId: r.id,
            isOpen: true,
            closedAt: null,
            closedMessage: null,
            scheduledReopenAt: null,
            updatedAt: new Date().toISOString(),
          });
          this.logger.log(`Restaurant ${r.id} (${r.name}) auto-opened at ${currentTime} (${tz})`);
        }
      }
    }
  }
}
```

Dependências do cron:
```bash
npm install @nestjs/schedule dayjs
npm install -D @types/dayjs
```

Registrar no `AppModule`:
```typescript
import { ScheduleModule } from '@nestjs/schedule';
// ...
imports: [
  ScheduleModule.forRoot(),
  // ...
]
```

Adicionar `RestaurantScheduleService` ao `RestaurantModule.providers`.

---

### H.11 Upload de imagem
```typescript
async uploadImage(restaurantId: string, ownerId: string, field: 'logo' | 'banner', file: Express.Multer.File): Promise<{ url: string }>
```
- Validar MIME (jpeg/png/webp) e tamanho (max 5 MB)
- Verificar ownerId → ForbiddenException
- Fazer upload via `StorageService.upload(buffer, mimetype, key)`
- Deletar imagem anterior se existir: `storageService.delete(previousUrl).catch(() => {})`
- Salvar URL no banco e retornar `{ url }`

---

## Parte I — restaurant.controller.ts — endpoints extras

Adicionar **antes** de `@Get(':id')`:
```
GET  /restaurants/search    → search (público)
GET  /restaurants/featured  → findFeatured (público)
GET  /restaurants/nearby    → findNearby (público)
GET  /restaurants/fastest   → findByDeliveryTime (público)
GET  /restaurants/favorites/my → findFavorites (@Roles('customer'))
```

Adicionar com parâmetro `:id`:
```
PATCH /restaurants/:id/status             → setStatus (@Roles('restaurant_owner')) — abre/fecha imediatamente + closedMessage + scheduledReopenAt
PATCH /restaurants/:id/operating-hours    → setOperatingHours (@Roles('restaurant_owner')) — define openingTime/closingTime/timezone
POST  /restaurants/:id/reviews            → createReview (@Roles('customer'))
GET   /restaurants/:id/reviews            → findReviews (público)
GET   /restaurants/:id/payment-methods    → findPaymentMethods (público)
PUT   /restaurants/:id/payment-methods    → updatePaymentMethods (@Roles('restaurant_owner'))
POST  /restaurants/:id/favorite           → toggleFavorite (@Roles('customer'))
GET   /restaurants/:id/favorite           → isFavorited (@Roles('customer'))
PATCH /restaurants/:id/delivery-fee       → setDeliveryFee (@Roles('admin'))
POST  /restaurants/:id/images/logo        → uploadLogo (@Roles('restaurant_owner'), @UseInterceptors(FileInterceptor))
POST  /restaurants/:id/images/banner      → uploadBanner (@Roles('restaurant_owner'), @UseInterceptors(FileInterceptor))
```

Para upload usar `FileInterceptor('file', { storage: memoryStorage() })` do `@nestjs/platform-express`.

---

## Parte J — StorageModule

> **O StorageModule é implementado pelo agente [e-storage](e-storage.md)** — não reimplementar aqui.
>
> O `StorageModule` é `@Global()`, portanto `StorageService` pode ser injetado diretamente no `RestaurantService` e `UserService` sem importar o módulo.

Para os uploads de logo, banner e imagem de produto, usar os utilitários do StorageModule:
```typescript
import { StorageService } from '../storage/storage.service';
import { validateImageFile } from '../storage/utils/image-validator.util';
import { generateStorageKey } from '../storage/utils/key-generator.util';

// No construtor:
constructor(
  // ... outros repositórios ...
  private readonly storageService: StorageService,
) {}

// No método uploadImage:
validateImageFile(file);
const key = generateStorageKey('restaurants', restaurantId, field, file.originalname);
const { url } = await this.storageService.upload(file.buffer, file.mimetype, key);
```

---

## Parte K — RestaurantModule atualizado

`src/modules/restaurant/restaurant.module.ts` deve importar:
```typescript
TypeOrmModule.forFeature([
  Restaurant, Product, RestaurantReview, Order, PaymentMethod,
  UserFavoriteRestaurant, ProductOptionGroup, ProductOption,
]),
// StorageModule NÃO precisa ser importado — é @Global()
```
E exportar `RestaurantService` e `ProductOptionService`.

---

## Parte L — Migration
```bash
npm run migration:generate -- src/database/migrations/AddRestaurantExtras
npm run migration:run
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e3-restaurant-modules
git add src/modules/restaurant src/modules/user src/modules/driver src/modules/storage src/common
git commit -m "feat: add base CRUD modules with restaurant extras, search, reviews, favorites"
git push origin feat/e3-restaurant-modules
gh pr create \
  --title "feat: E3 - Restaurant, User, Driver modules + extras" \
  --base main \
  --body "## O que foi feito
- UserModule, DriverModule com CRUD completo
- RestaurantModule: CRUD + busca por distância (Haversine), avaliações, favoritos, métodos de pagamento, upload de imagem
- StorageModule abstrato com implementação local para dev
- PaginationDto reutilizável

## Depende de
PR E2 mergeado

## Endpoints (prefixo /api/v1)
- GET /restaurants/search?lat&lng&radiusKm&onlyOpen&sortBy
- GET /restaurants/nearby?lat&lng
- GET /restaurants/featured
- GET /restaurants/fastest
- POST /restaurants/:id/reviews (customer)
- POST/GET /restaurants/:id/favorite (customer)
- PUT /restaurants/:id/payment-methods (owner)
- POST /restaurants/:id/images/logo|banner (owner)"
```

## Resposta do `GET /restaurants/:id`

O objeto do restaurante deve incluir os campos de fechamento para que o app mostre ao usuário:
```json
{
  "id": "...",
  "name": "Burguer House",
  "isOpen": false,
  "closedAt": "2025-12-25T22:30:00.000Z",
  "closedMessage": "Abrimos às 11h",
  "scheduledReopenAt": "2025-12-26T11:00:00.000Z",
  "openingTime": "11:00",
  "closingTime": "22:30",
  "timezone": "America/Sao_Paulo",
  "deliveryFee": "5.99",
  ...
}
```
O frontend usa esses campos para exibir: badge "Fechado • Abre às 11h", countdown de reabertura, mensagem personalizada do dono.

## Regras
- Endpoints literais (`/search`, `/featured`, etc.) ANTES de `/:id` no controller
- Nunca retornar `passwordHash` — usar `Exclude()` ou selecionar campos manualmente
- `NotFoundException` quando recurso não encontrado
- `ForbiddenException` quando usuário não é dono do recurso
- Snapshot de avaliação: recalcular `averageRating` via SQL após cada review
- **`setDeliveryFee` deve invalidar o cache Redis `restaurant:{id}`** — pedidos novos devem sempre pegar a taxa vigente
- **`setStatus(false)` grava `closedAt = now()`** — nunca deixar `closedAt` nulo quando fechado
- **`setStatus(true)` limpa `closedAt`, `closedMessage` e `scheduledReopenAt`** — ao reabrir, resetar tudo
- `openingTime` e `closingTime` no formato `HH:MM` validado pelo regex `/^([01]\d|2[0-3]):([0-5]\d)$/`
- Cron roda a cada minuto — fechar/abrir com precisão de 1 min (suficiente para uso prático)
