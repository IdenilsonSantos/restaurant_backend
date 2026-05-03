---
name: e3-restaurant
description: Etapa 3 — cria RestaurantModule, UserModule e DriverModule com CRUD completo incluindo busca avançada por distância (Haversine), avaliações, favoritos, métodos de pagamento, upload de imagem, open/close e cron de horário. Depende da E2 e E-Storage.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 3 — Módulos Base + Restaurant Extras.

## Pré-requisito
PRs E1, E2 e **E-Storage** mergeados. `StorageModule` já é `@Global()` — injetar `StorageService` diretamente.

## Dependências
```bash
npm install @nestjs/schedule dayjs bcrypt
npm install -D @types/bcrypt @types/multer
```

Registrar `ScheduleModule.forRoot()` no `AppModule`.

---

## UserModule (`src/modules/user/`)

**DTOs**: `create-user.dto.ts` — name, email, password (min 8), phone, role | `update-user.dto.ts` — PartialType sem password

**UserService**:
- `create(dto)` — hash bcrypt; nunca retornar passwordHash
- `findOne(id)` — NotFoundException se não existe
- `findByEmail(email)` — usado pelo AuthModule
- `update(id, dto)`, `remove(id)`

**Endpoints**: `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id`

---

## DriverModule (`src/modules/driver/`)

**DTOs**: create (userId, vehicleType, licensePlate) | update (PartialType + isAvailable, currentLatitude, currentLongitude) | update-location (lat, lng) | update-availability (isAvailable boolean)

**DriverService**: `create`, `findOne`, `findByUserId`, `update`, `updateLocation(id, lat, lng)`, `setAvailability(id, available)`

**Endpoints**: `POST /drivers`, `GET /drivers/:id`, `PATCH /drivers/:id`, `PATCH /drivers/:id/location`, `PATCH /drivers/:id/availability`

---

## Common — Paginação

`src/common/dto/pagination.dto.ts` — `page: int ≥1, default 1` | `limit: int ≥1 ≤100, default 10` (ambos com `@IsOptional`, `@Type(() => Number)`)

`src/common/interfaces/paginated-result.interface.ts` — `{ data: T[], total, page, limit, totalPages }`

---

## RestaurantModule (`src/modules/restaurant/`)

### DTOs

- **create-restaurant.dto.ts**: name, description, address, latitude, longitude, deliveryFee (opcional, default 0)
- **update-restaurant.dto.ts**: PartialType
- **create-product.dto.ts**: restaurantId, name, description, price, imageUrl (opcional)
- **update-product.dto.ts**: PartialType
- **nearby-restaurant.dto.ts**: lat, lng (obrigatórios), radiusKm (default 5, max 50), limit (default 10), onlyOpen (boolean, default false)
- **search-restaurant.dto.ts** extends PaginationDto: onlyOpen?, featured?, maxDeliveryMinutes?, lat?, lng?, radiusKm?, sortBy?: `'distance'|'delivery'|'rating'|'featured'`
- **create-review.dto.ts**: orderId (UUID), rating (int 1–5), comment (string, opcional)
- **paginated-reviews.dto.ts** extends PaginationDto: minRating (opcional)
- **update-payment-methods.dto.ts**: paymentMethodIds (UUID[], min 1)
- **set-delivery-fee.dto.ts**: deliveryFee (number ≥0), isFreeDelivery (boolean, opcional)
- **set-restaurant-status.dto.ts**: isOpen (boolean), closedMessage (string ≤120, opcional), scheduledReopenAt (ISO 8601 string, opcional)
- **set-operating-hours.dto.ts**: openingTime (string `HH:MM`, opcional), closingTime (string `HH:MM`, opcional), timezone (IANA timezone string, opcional)

Regex para HH:MM: `/^([01]\d|2[0-3]):([0-5]\d)$/`

### Interface

```typescript
// src/modules/restaurant/interfaces/restaurant-with-distance.interface.ts
export interface RestaurantWithDistance extends Restaurant {
  distanceKm?: number;
  adjustedDeliveryMinutes?: number;
}
```

---

## Utilitário Haversine (manter como código)

```typescript
// src/modules/restaurant/utils/haversine.util.ts
const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}
```

---

## RestaurantService — métodos

Injetar: repos de `Restaurant`, `Product`, `RestaurantReview`, `Order`, `PaymentMethod`, `UserFavoriteRestaurant`, e `StorageService`.

### Base
- `create(dto)`, `findAll(page, limit)` paginado, `findOne(id)` NotFoundException, `update(id, dto)` + invalidar cache, `remove(id)`
- `createProduct`, `findProducts(restaurantId)` (somente disponíveis), `updateProduct`, `removeProduct`

### Busca avançada

**search(dto: SearchRestaurantDto)**: filtros DB (onlyOpen, featured, maxDeliveryMinutes) → enriquecer com Haversine se lat/lng → filtrar por raio → ordenar por sortBy → paginar em memória.

**findFeatured()**: `WHERE isFeatured=true AND isOpen=true ORDER BY totalOrders DESC LIMIT 10`

**findNearby(dto)**: Haversine em memória → filtrar por raio → ordenar por distância crescente.

**findByDeliveryTime(lat?, lng?, limit=10)**: ordenar por `adjustedDeliveryMinutes = estimatedDeliveryMinutes + ceil(distanceKm * 2)`.

### Avaliações

**createReview(restaurantId, customerId, dto)**
1. Verificar que `orderId` pertence ao customerId E ao restaurantId → NotFoundException
2. Verificar pedido está `DELIVERED` → BadRequestException
3. Salvar review — ConflictException se `@Unique(customerId+orderId)` violar
4. Recalcular `averageRating` e `totalReviews` via subquery SQL

**findReviews(restaurantId, dto)**: leftJoin customer, filtro minRating, ORDER BY createdAt DESC, paginado.

### Métodos de pagamento

**findPaymentMethods(restaurantId)**: relations `['acceptedPaymentMethods']`

**updatePaymentMethods(restaurantId, ownerId, dto)**
1. ForbiddenException se ownerId !== restaurant.ownerId
2. Verificar que todos os paymentMethodIds existem e isActive=true → BadRequestException
3. Salvar

### Favoritos

**toggleFavorite(restaurantId, userId)**: se existe → remove, retorna `{favorited: false}`; se não → cria, retorna `{favorited: true}`

**findFavorites(userId)**: relations `['restaurant']`, ORDER BY createdAt DESC

**isFavorited(restaurantId, userId)**: retorna `{favorited: boolean}`

### Taxa de entrega

**setDeliveryFee(restaurantId, dto)**
1. findOne → ForbiddenException (verificar ownership no controller)
2. `deliveryFee = dto.isFreeDelivery ? 0 : dto.deliveryFee`
3. `redisService.cacheDel('restaurant:{id}')` — obrigatório para snapshots de novos pedidos

### Status do restaurante

**setStatus(restaurantId, ownerId, dto)** — sequência obrigatória de 3 passos:
1. findOne → ForbiddenException se ownerId !== restaurant.ownerId
2. Contar pedidos ativos se fechando (para informar dono)
3. Atualizar: `isOpen`, `closedAt` (null se abrindo), `closedMessage`, `scheduledReopenAt`
4. `redisService.setRestaurantOpen(id, isOpen)` — chave sem TTL (rejeição imediata)
5. `redisService.cacheDel('restaurant:{id}')` — invalida cache do objeto
6. `eventsService.emitRestaurantStatus(...)` — propaga em tempo real

Retorna `{ isOpen, activeOrdersCount }`. Fechar **não cancela** pedidos em andamento.

### Horário de funcionamento

**setOperatingHours(restaurantId, ownerId, dto)**
1. findOne → ForbiddenException
2. Atualizar openingTime, closingTime, timezone (apenas os fornecidos)
3. `redisService.cacheDel('restaurant:{id}')`

### Upload de imagem

**uploadImage(restaurantId, ownerId, field: 'logo'|'banner', file)**
1. Validar MIME (jpeg/png/webp) e tamanho (max 5 MB)
2. ForbiddenException se ownerId !== restaurant.ownerId
3. `storageService.delete(previousUrl).catch(() => {})` se existir
4. `storageService.upload(file.buffer, file.mimetype, key)`
5. Salvar URL no banco, retornar `{ url }`

Usar `validateImageFile(file)` e `generateStorageKey('restaurants', id, field, file.originalname)` dos utils do StorageModule.

---

## Cron Service (`src/modules/restaurant/restaurant-schedule.service.ts`)

```typescript
@Injectable()
export class RestaurantScheduleService {
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledEvents(): Promise<void> {
    await this.processScheduledReopens();
    await this.processDailySchedule();
  }

  private async processScheduledReopens(): Promise<void> {
    // Buscar: isOpen=false AND scheduledReopenAt <= now()
    // Para cada: setar isOpen=true, limpar closedAt/closedMessage/scheduledReopenAt
    // redisService.setRestaurantOpen(id, true) + cacheDel + emitRestaurantStatus
  }

  private async processDailySchedule(): Promise<void> {
    // Buscar: openingTime IS NOT NULL OR closingTime IS NOT NULL
    // Para cada restaurante com timezone configurado:
    const tz = r.timezone ?? 'America/Sao_Paulo';
    const currentTime = dayjs().tz(tz).format('HH:mm');

    // Fechar se isOpen=true E currentTime >= closingTime
    // Abrir se !isOpen E currentTime >= openingTime E currentTime < closingTime E !scheduledReopenAt
    // Ao fechar: closedAt=now(), closedMessage='Abrimos às {openingTime}' (se definido)
    // Em ambos: setRestaurantOpen + cacheDel + emitRestaurantStatus
  }
}
```

Usar `dayjs` + plugins `utc` e `timezone`. Registrar no `RestaurantModule.providers`.

---

## Endpoints (controller)

> Rotas literais **ANTES** de `/:id` no controller.

```
GET    /restaurants/search           → search (público)
GET    /restaurants/featured         → findFeatured (público)
GET    /restaurants/nearby           → findNearby (público)
GET    /restaurants/fastest          → findByDeliveryTime (público)
GET    /restaurants/favorites/my     → findFavorites (@Roles('customer'))

POST   /restaurants                  → create (@Roles('restaurant_owner'))
GET    /restaurants?page&limit       → findAll (público)
GET    /restaurants/:id              → findOne (público)
PATCH  /restaurants/:id              → update (@Roles('restaurant_owner'))
DELETE /restaurants/:id              → remove (@Roles('restaurant_owner'))

PATCH  /restaurants/:id/status               → setStatus (@Roles('restaurant_owner'))
PATCH  /restaurants/:id/operating-hours      → setOperatingHours (@Roles('restaurant_owner'))
POST   /restaurants/:id/reviews              → createReview (@Roles('customer'))
GET    /restaurants/:id/reviews              → findReviews (público)
GET    /restaurants/:id/payment-methods      → findPaymentMethods (público)
PUT    /restaurants/:id/payment-methods      → updatePaymentMethods (@Roles('restaurant_owner'))
POST   /restaurants/:id/favorite             → toggleFavorite (@Roles('customer'))
GET    /restaurants/:id/favorite             → isFavorited (@Roles('customer'))
PATCH  /restaurants/:id/delivery-fee         → setDeliveryFee (@Roles('admin'))
POST   /restaurants/:id/images/logo          → uploadLogo (@Roles('restaurant_owner'), FileInterceptor)
POST   /restaurants/:id/images/banner        → uploadBanner (@Roles('restaurant_owner'), FileInterceptor)

POST   /restaurants/:id/products             → createProduct (@Roles('restaurant_owner'))
GET    /restaurants/:id/products             → findProducts (público)
PATCH  /restaurants/:id/products/:productId  → updateProduct (@Roles('restaurant_owner'))
DELETE /restaurants/:id/products/:productId  → removeProduct (@Roles('restaurant_owner'))
```

Upload: `FileInterceptor('file', { storage: memoryStorage() })` do `@nestjs/platform-express`.

---

## RestaurantModule

```typescript
TypeOrmModule.forFeature([
  Restaurant, Product, RestaurantReview, Order, PaymentMethod,
  UserFavoriteRestaurant, ProductOptionGroup, ProductOption,
])
// StorageModule NÃO importar — é @Global()
// EventsModule importar (ou forwardRef) para EventsService
```

Providers: `RestaurantService`, `ProductOptionService`, `RestaurantScheduleService`.
Exports: `RestaurantService`, `ProductOptionService`.

## Migration
```bash
npm run migration:generate -- src/database/migrations/AddRestaurantExtras
npm run migration:run
```

## Commit
```bash
git checkout -b feat/e3-restaurant-modules
git add src/modules/restaurant src/modules/user src/modules/driver src/common
git commit -m "feat: add base CRUD modules with restaurant extras, search, reviews, favorites"
```

## Regras
- Rotas literais antes de `/:id`
- Nunca retornar `passwordHash`
- `setDeliveryFee` **deve** invalidar `restaurant:{id}` — novos pedidos capturam a taxa via cache
- `setStatus(false)` grava `closedAt=now()` — nunca nulo quando fechado
- `setStatus(true)` limpa `closedAt`, `closedMessage`, `scheduledReopenAt`
- Fechar o restaurante **não cancela** pedidos em andamento
- averageRating recalculado via SQL após cada review (não em memória)
