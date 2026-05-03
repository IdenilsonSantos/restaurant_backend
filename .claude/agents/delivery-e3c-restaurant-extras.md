---
name: delivery-e3c-restaurant-extras
description: Etapa 3C do sistema de delivery — adiciona busca avançada de restaurantes por destaques, por distância (Haversine, em tempo real), por tempo de entrega; sistema de avaliação por clientes; métodos de pagamento aceitos por restaurante; upload de imagem (logo/banner). Depende das Etapas 1-3 e E6 (PaymentMethod já existe).
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 3C — Restaurant Extras** do sistema de delivery.

## Pré-requisito
PRs das Etapas 1, 2, 3 e 6 mergeados na `main`. As entidades `Restaurant` (com `latitude`, `longitude`, `isOpen`), `Order`, `User` e `PaymentMethod` já existem.

---

## Parte 1 — Novos campos na entidade `Restaurant`

Adicione em `src/modules/restaurant/entities/restaurant.entity.ts`:

```typescript
import { ManyToMany, JoinTable } from 'typeorm';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';

// — dentro da classe —

@Column({ type: 'boolean', default: false })
isFeatured!: boolean;

@Column({ type: 'int', default: 30 })
estimatedDeliveryMinutes!: number;

@Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
averageRating!: number;

@Column({ type: 'int', default: 0 })
totalReviews!: number;

@Column({ type: 'int', default: 0 })
totalOrders!: number;

@Column({ type: 'varchar', nullable: true })
logoUrl!: string | null;

@Column({ type: 'varchar', nullable: true })
bannerUrl!: string | null;

@ManyToMany(() => PaymentMethod, { eager: true })
@JoinTable({
  name: 'restaurant_payment_methods',
  joinColumn:        { name: 'restaurantId',    referencedColumnName: 'id' },
  inverseJoinColumn: { name: 'paymentMethodId', referencedColumnName: 'id' },
})
acceptedPaymentMethods!: PaymentMethod[];
```

---

## Parte 2 — Migration única

Gere e revise a migration consolidada:

```bash
npm run migration:generate -- src/database/migrations/AddRestaurantExtras
npm run migration:run
```

A migration deve conter:
- `ALTER TABLE restaurants ADD COLUMN isFeatured`, `estimatedDeliveryMinutes`, `averageRating`, `totalReviews`, `totalOrders`, `logoUrl`, `bannerUrl`
- `CREATE TABLE restaurant_payment_methods` (tabela de junção)
- `CREATE TABLE restaurant_reviews` (veja entidade abaixo)

---

## Parte 3 — Utilitário Haversine

**`src/modules/restaurant/utils/haversine.util.ts`**:

```typescript
const EARTH_RADIUS_KM = 6371;

/**
 * Calcula a distância em km entre dois pontos geográficos
 * usando a fórmula de Haversine.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
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

## Parte 4 — DTOs

**`src/modules/restaurant/dto/nearby-restaurant.dto.ts`**:

```typescript
import { Type, Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class NearbyRestaurantDto {
  @Type(() => Number) @IsNumber()
  lat!: number;

  @Type(() => Number) @IsNumber()
  lng!: number;

  /** Raio em km (padrão: 5, máx: 50) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1) @Max(50)
  radiusKm?: number = 5;

  /** Máx. de resultados (padrão: 10, máx: 50) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number = 10;

  /** true → somente restaurantes abertos */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyOpen?: boolean = false;
}
```

**`src/modules/restaurant/dto/search-restaurant.dto.ts`**:

```typescript
import { Type, Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class SearchRestaurantDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyOpen?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  /** Tempo máximo de entrega em minutos */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120)
  maxDeliveryMinutes?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  lat?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  lng?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1) @Max(50)
  radiusKm?: number;

  /**
   * 'distance'  → mais próximo primeiro (exige lat+lng)
   * 'delivery'  → menor tempo de entrega ajustado primeiro
   * 'rating'    → melhor avaliação primeiro
   * 'featured'  → destaques primeiro, depois totalOrders DESC
   */
  @IsOptional()
  sortBy?: 'distance' | 'delivery' | 'rating' | 'featured';
}
```

**`src/modules/restaurant/dto/create-review.dto.ts`**:

```typescript
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @IsUUID()
  orderId!: string;

  @IsInt() @Min(1) @Max(5)
  rating!: number;

  @IsOptional() @IsString()
  comment?: string;
}
```

**`src/modules/restaurant/dto/paginated-reviews.dto.ts`**:

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class PaginatedReviewsDto extends PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  minRating?: number;
}
```

**`src/modules/restaurant/dto/update-payment-methods.dto.ts`**:

```typescript
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class UpdatePaymentMethodsDto {
  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true })
  paymentMethodIds!: string[];
}
```

---

## Parte 5 — Entidade `RestaurantReview`

**`src/modules/restaurant/entities/restaurant-review.entity.ts`**:

```typescript
import {
  Column, CreateDateColumn, Entity, Index,
  JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique,
} from 'typeorm';

@Entity('restaurant_reviews')
@Unique('UQ_review_customer_order', ['customerId', 'orderId'])
export class RestaurantReview {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Index() @Column({ type: 'uuid' }) restaurantId!: string;
  @Index() @Column({ type: 'uuid' }) customerId!: string;

  /** Garante que o cliente realmente fez o pedido */
  @Column({ type: 'uuid' }) orderId!: string;

  /** Nota de 1 a 5 */
  @Column({ type: 'smallint' }) rating!: number;

  @Column({ type: 'text', nullable: true }) comment!: string | null;

  @CreateDateColumn() createdAt!: Date;

  @ManyToOne('Restaurant', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurantId' }) restaurant!: any;

  @ManyToOne('User') @JoinColumn({ name: 'customerId' }) customer!: any;
  @ManyToOne('Order') @JoinColumn({ name: 'orderId' })   order!: any;
}
```

---

## Parte 6 — Interface enriquecida

**`src/modules/restaurant/interfaces/restaurant-with-distance.interface.ts`**:

```typescript
import { Restaurant } from '../entities/restaurant.entity';

export interface RestaurantWithDistance extends Restaurant {
  /** km calculado em tempo real via Haversine. Presente apenas com lat+lng. */
  distanceKm?: number;
  /** estimatedDeliveryMinutes + ceil(distanceKm * 2) — assume ~30 km/h */
  adjustedDeliveryMinutes?: number;
}
```

---

## Parte 7 — `RestaurantService` (métodos novos)

Substitua o construtor e importe as dependências necessárias:

```typescript
import { BadRequestException, ConflictException, ForbiddenException,
         Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Restaurant } from './entities/restaurant.entity';
import { Product } from './entities/product.entity';
import { RestaurantReview } from './entities/restaurant-review.entity';
import { Order } from '../order/entities/order.entity';
import { PaymentMethod } from '../payment/entities/payment-method.entity';
import { haversineKm } from './utils/haversine.util';
import { NearbyRestaurantDto } from './dto/nearby-restaurant.dto';
import { SearchRestaurantDto } from './dto/search-restaurant.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { PaginatedReviewsDto } from './dto/paginated-reviews.dto';
import { UpdatePaymentMethodsDto } from './dto/update-payment-methods.dto';
import { RestaurantWithDistance } from './interfaces/restaurant-with-distance.interface';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { StorageService } from '../storage/storage.service';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import { validateImageFile } from './utils/image-upload.config';

@Injectable()
export class RestaurantService {
  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(RestaurantReview)
    private readonly reviewRepository: Repository<RestaurantReview>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
    private readonly storageService: StorageService,
  ) {}
```

### 7.1 Busca avançada `/search`

```typescript
async search(dto: SearchRestaurantDto): Promise<PaginatedResult<RestaurantWithDistance>> {
  const qb = this.restaurantRepository.createQueryBuilder('r');

  if (dto.onlyOpen)             qb.andWhere('r.isOpen = true');
  if (dto.featured)             qb.andWhere('r.isFeatured = true');
  if (dto.maxDeliveryMinutes)   qb.andWhere('r.estimatedDeliveryMinutes <= :max', { max: dto.maxDeliveryMinutes });

  const allMatching = await qb.getMany();
  const hasCoords = dto.lat !== undefined && dto.lng !== undefined;

  let enriched: RestaurantWithDistance[] = allMatching.map((r) => {
    const result: RestaurantWithDistance = { ...r };
    if (hasCoords) {
      const distanceKm = Math.round(
        haversineKm(dto.lat!, dto.lng!, Number(r.latitude), Number(r.longitude)) * 10,
      ) / 10;
      result.distanceKm = distanceKm;
      result.adjustedDeliveryMinutes = r.estimatedDeliveryMinutes + Math.ceil(distanceKm * 2);
    }
    return result;
  });

  if (hasCoords && dto.radiusKm !== undefined) {
    enriched = enriched.filter((r) => (r.distanceKm ?? Infinity) <= dto.radiusKm!);
  }

  const sortBy = dto.sortBy ?? (hasCoords ? 'distance' : 'featured');
  enriched.sort((a, b) => {
    switch (sortBy) {
      case 'distance': return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
      case 'delivery':
        return (a.adjustedDeliveryMinutes ?? a.estimatedDeliveryMinutes)
             - (b.adjustedDeliveryMinutes ?? b.estimatedDeliveryMinutes);
      case 'rating':   return Number(b.averageRating) - Number(a.averageRating);
      case 'featured':
      default:
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return b.totalOrders - a.totalOrders;
    }
  });

  const page  = dto.page  ?? 1;
  const limit = dto.limit ?? 10;
  const total = enriched.length;
  const data  = enriched.slice((page - 1) * limit, page * limit);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}
```

### 7.2 Restaurantes em destaque `/featured`

```typescript
async findFeatured(): Promise<RestaurantWithDistance[]> {
  return this.restaurantRepository.find({
    where: { isFeatured: true, isOpen: true },
    order: { totalOrders: 'DESC' },
    take: 10,
  }) as Promise<RestaurantWithDistance[]>;
}
```

### 7.3 Restaurantes próximos `/nearby`

```typescript
/**
 * Restaurantes dentro do raio informado, ordenados do mais próximo ao mais distante.
 * Distância calculada em memória via Haversine — sem PostGIS.
 */
async findNearby(dto: NearbyRestaurantDto): Promise<RestaurantWithDistance[]> {
  const radiusKm = dto.radiusKm ?? 5;
  const limit    = dto.limit    ?? 10;

  const all = await this.restaurantRepository.find({
    where: dto.onlyOpen ? { isOpen: true } : {},
  });

  return all
    .map((r) => {
      const distanceKm =
        Math.round(haversineKm(dto.lat, dto.lng, Number(r.latitude), Number(r.longitude)) * 10) / 10;
      return {
        ...r,
        distanceKm,
        adjustedDeliveryMinutes: r.estimatedDeliveryMinutes + Math.ceil(distanceKm * 2),
      } as RestaurantWithDistance;
    })
    .filter((r) => r.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
```

### 7.4 Menor tempo de entrega `/fastest`

```typescript
async findByDeliveryTime(lat?: number, lng?: number, limit = 10): Promise<RestaurantWithDistance[]> {
  const all = await this.restaurantRepository.find({ where: { isOpen: true } });
  const hasCoords = lat !== undefined && lng !== undefined;

  return all
    .map((r) => {
      const distanceKm = hasCoords
        ? Math.round(haversineKm(lat!, lng!, Number(r.latitude), Number(r.longitude)) * 10) / 10
        : undefined;
      const adjustedDeliveryMinutes = distanceKm !== undefined
        ? r.estimatedDeliveryMinutes + Math.ceil(distanceKm * 2)
        : r.estimatedDeliveryMinutes;
      return { ...r, distanceKm, adjustedDeliveryMinutes } as RestaurantWithDistance;
    })
    .sort((a, b) =>
      (a.adjustedDeliveryMinutes ?? a.estimatedDeliveryMinutes) -
      (b.adjustedDeliveryMinutes ?? b.estimatedDeliveryMinutes),
    )
    .slice(0, limit);
}
```

### 7.5 Avaliações

```typescript
async createReview(restaurantId: string, customerId: string, dto: CreateReviewDto): Promise<RestaurantReview> {
  const order = await this.orderRepository.findOne({
    where: { id: dto.orderId, customerId, restaurantId },
  });
  if (!order) throw new NotFoundException('Pedido não encontrado ou não pertence a você');
  if (order.status !== OrderStatus.DELIVERED)
    throw new BadRequestException('Só é possível avaliar pedidos entregues');

  const existing = await this.reviewRepository.findOne({ where: { customerId, orderId: dto.orderId } });
  if (existing) throw new ConflictException('Você já avaliou este pedido');

  const review = this.reviewRepository.create({
    restaurantId, customerId, orderId: dto.orderId,
    rating: dto.rating, comment: dto.comment ?? null,
  });
  const saved = await this.reviewRepository.save(review);

  // Atualiza média e total atomicamente
  await this.restaurantRepository
    .createQueryBuilder()
    .update()
    .set({
      averageRating: () =>
        `(SELECT ROUND(AVG(rating)::numeric, 2) FROM restaurant_reviews WHERE "restaurantId" = '${restaurantId}')`,
      totalReviews: () =>
        `(SELECT COUNT(*) FROM restaurant_reviews WHERE "restaurantId" = '${restaurantId}')`,
    })
    .where('id = :id', { id: restaurantId })
    .execute();

  return saved;
}

async findReviews(restaurantId: string, dto: PaginatedReviewsDto): Promise<PaginatedResult<RestaurantReview>> {
  await this.findOne(restaurantId);
  const qb = this.reviewRepository
    .createQueryBuilder('rv')
    .leftJoinAndSelect('rv.customer', 'customer')
    .where('rv.restaurantId = :restaurantId', { restaurantId })
    .orderBy('rv.createdAt', 'DESC');

  if (dto.minRating) qb.andWhere('rv.rating >= :minRating', { minRating: dto.minRating });

  const page  = dto.page  ?? 1;
  const limit = dto.limit ?? 10;
  const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}
```

### 7.6 Métodos de pagamento

```typescript
async findPaymentMethods(restaurantId: string): Promise<PaymentMethod[]> {
  const restaurant = await this.restaurantRepository.findOne({
    where: { id: restaurantId },
    relations: ['acceptedPaymentMethods'],
  });
  if (!restaurant) throw new NotFoundException(`Restaurant "${restaurantId}" not found`);
  return restaurant.acceptedPaymentMethods;
}

async updatePaymentMethods(restaurantId: string, ownerId: string, dto: UpdatePaymentMethodsDto): Promise<PaymentMethod[]> {
  const restaurant = await this.restaurantRepository.findOne({
    where: { id: restaurantId }, relations: ['acceptedPaymentMethods'],
  });
  if (!restaurant) throw new NotFoundException(`Restaurant "${restaurantId}" not found`);
  if (restaurant.ownerId !== ownerId) throw new ForbiddenException();

  const methods = await this.paymentMethodRepository.findBy({ id: In(dto.paymentMethodIds), isActive: true });
  if (methods.length !== dto.paymentMethodIds.length)
    throw new BadRequestException('Um ou mais métodos de pagamento são inválidos ou inativos');

  restaurant.acceptedPaymentMethods = methods;
  await this.restaurantRepository.save(restaurant);
  return methods;
}
```

### 7.7 Upload de imagem

```typescript
async uploadImage(
  restaurantId: string, ownerId: string,
  field: 'logo' | 'banner', file: Express.Multer.File,
): Promise<{ url: string }> {
  validateImageFile(file);
  const restaurant = await this.restaurantRepository.findOne({ where: { id: restaurantId } });
  if (!restaurant) throw new NotFoundException(`Restaurant "${restaurantId}" not found`);
  if (restaurant.ownerId !== ownerId) throw new ForbiddenException();

  const filename = `restaurants/${restaurantId}/${field}-${uuidv4()}${extname(file.originalname).toLowerCase()}`;
  const url = await this.storageService.upload(file.buffer, file.mimetype, filename);

  // Apaga a imagem anterior no storage, se houver
  const previousUrl = field === 'logo' ? restaurant.logoUrl : restaurant.bannerUrl;
  if (previousUrl) {
    await this.storageService.delete(previousUrl).catch(() => { /* ignora falhas de limpeza */ });
  }

  if (field === 'logo') restaurant.logoUrl = url;
  else                  restaurant.bannerUrl = url;

  await this.restaurantRepository.save(restaurant);
  return { url };
}
```

---

## Parte 8 — `RestaurantController` (endpoints novos)

Adicione os imports no topo:

```typescript
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedFile, UseInterceptors, Put } from '@nestjs/common';
import { memoryStorage } from 'multer';
import { NearbyRestaurantDto } from './dto/nearby-restaurant.dto';
import { SearchRestaurantDto } from './dto/search-restaurant.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { PaginatedReviewsDto } from './dto/paginated-reviews.dto';
import { UpdatePaymentMethodsDto } from './dto/update-payment-methods.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
```

> **IMPORTANTE**: coloque os endpoints literais (`/search`, `/featured`, `/nearby`, `/fastest`) **antes** de `@Get(':id')` para evitar conflito com o parâmetro UUID.

```typescript
// ── Busca avançada ──────────────────────────────────────────────────────────

@Get('search')
search(@Query() dto: SearchRestaurantDto) {
  return this.restaurantService.search(dto);
}

@Get('featured')
findFeatured() {
  return this.restaurantService.findFeatured();
}

/**
 * Restaurantes próximos ao cliente.
 * GET /restaurants/nearby?lat=-23.56&lng=-46.65&radiusKm=5&onlyOpen=true&limit=10
 */
@Get('nearby')
findNearby(@Query() dto: NearbyRestaurantDto) {
  return this.restaurantService.findNearby(dto);
}

@Get('fastest')
findByDeliveryTime(
  @Query('lat')   lat?:   string,
  @Query('lng')   lng?:   string,
  @Query('limit') limit?: string,
) {
  return this.restaurantService.findByDeliveryTime(
    lat   ? parseFloat(lat)     : undefined,
    lng   ? parseFloat(lng)     : undefined,
    limit ? parseInt(limit, 10) : 10,
  );
}

// ── Avaliações ──────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('customer')
@Post(':id/reviews')
createReview(
  @Param('id', ParseUUIDPipe) restaurantId: string,
  @CurrentUser() user: any,
  @Body() dto: CreateReviewDto,
) {
  return this.restaurantService.createReview(restaurantId, user.id, dto);
}

@Get(':id/reviews')
findReviews(
  @Param('id', ParseUUIDPipe) restaurantId: string,
  @Query() dto: PaginatedReviewsDto,
) {
  return this.restaurantService.findReviews(restaurantId, dto);
}

// ── Métodos de pagamento ────────────────────────────────────────────────────

@Get(':id/payment-methods')
findPaymentMethods(@Param('id', ParseUUIDPipe) id: string) {
  return this.restaurantService.findPaymentMethods(id);
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('restaurant_owner')
@Put(':id/payment-methods')
updatePaymentMethods(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: any,
  @Body() dto: UpdatePaymentMethodsDto,
) {
  return this.restaurantService.updatePaymentMethods(id, user.id, dto);
}

// ── Upload de imagem ────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('restaurant_owner')
@Post(':id/images/logo')
@UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
uploadLogo(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: any,
  @UploadedFile() file: Express.Multer.File,
) {
  return this.restaurantService.uploadImage(id, user.id, 'logo', file);
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('restaurant_owner')
@Post(':id/images/banner')
@UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
uploadBanner(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: any,
  @UploadedFile() file: Express.Multer.File,
) {
  return this.restaurantService.uploadImage(id, user.id, 'banner', file);
}
```

---

## Parte 9 — Validação de imagem e StorageService

### 9.1 Validador de arquivo

**`src/modules/restaurant/utils/image-upload.config.ts`**:

```typescript
import { BadRequestException } from '@nestjs/common';

const ALLOWED_TYPES = /^image\/(jpeg|png|webp)$/;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageFile(file: Express.Multer.File): void {
  if (!ALLOWED_TYPES.test(file.mimetype))
    throw new BadRequestException('Apenas imagens JPEG, PNG e WebP são aceitas');
  if (file.size > MAX_SIZE_BYTES)
    throw new BadRequestException('Imagem deve ter no máximo 5 MB');
}
```

### 9.2 StorageService (abstrato)

Crie um módulo dedicado `src/modules/storage/`:

**`src/modules/storage/storage.service.ts`**:

```typescript
import { Injectable } from '@nestjs/common';

/**
 * Contrato do serviço de storage.
 * Implemente esta classe com o provider escolhido (S3, GCS, Supabase, Cloudinary…).
 * O método upload deve retornar a URL pública permanente do arquivo.
 */
@Injectable()
export abstract class StorageService {
  /**
   * Faz upload de um buffer e retorna a URL pública do arquivo.
   * @param buffer   - conteúdo do arquivo em memória
   * @param mimetype - tipo MIME (ex: "image/jpeg")
   * @param key      - caminho/nome no storage (ex: "restaurants/<id>/logo-<uuid>.jpg")
   */
  abstract upload(buffer: Buffer, mimetype: string, key: string): Promise<string>;

  /**
   * Remove um arquivo pelo URL ou key.
   * Deve ser tolerante a falhas (arquivo já removido não lança exceção).
   */
  abstract delete(urlOrKey: string): Promise<void>;
}
```

**`src/modules/storage/storage.module.ts`**:

```typescript
import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
// import { S3StorageService } from './s3-storage.service';       // exemplo AWS S3
// import { GcsStorageService } from './gcs-storage.service';     // exemplo GCS
// import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  providers: [
    {
      provide: StorageService,
      // Troque pela implementação real antes de ir para produção:
      useClass: StorageService, // placeholder — não instanciável, ver nota abaixo
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
```

> **Nota**: `StorageService` é abstrata — o agente que implementar o provider real deve criar
> uma classe concreta (ex: `S3StorageService extends StorageService`) e registrá-la no
> `StorageModule` via `useClass`. Enquanto isso não acontece, o endpoint de upload lançará
> erro 500 com a mensagem definida na implementação.

### 9.3 Exemplo de implementação concreta (S3-compatible)

**`src/modules/storage/s3-storage.service.ts`** (referência — adaptar ao SDK do provider):

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
// npm install @aws-sdk/client-s3
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class S3StorageService extends StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.bucket = config.getOrThrow('STORAGE_BUCKET');
    this.publicBaseUrl = config.getOrThrow('STORAGE_PUBLIC_URL'); // ex: https://cdn.exemplo.com
    this.s3 = new S3Client({
      region: config.getOrThrow('STORAGE_REGION'),
      endpoint: config.get('STORAGE_ENDPOINT'), // para R2/MinIO
      credentials: {
        accessKeyId:     config.getOrThrow('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow('STORAGE_SECRET_ACCESS_KEY'),
      },
    });
  }

  async upload(buffer: Buffer, mimetype: string, key: string): Promise<string> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: buffer,
      ContentType: mimetype, ACL: 'public-read',
    }));
    return `${this.publicBaseUrl}/${key}`;
  }

  async delete(urlOrKey: string): Promise<void> {
    const key = urlOrKey.startsWith('http')
      ? urlOrKey.replace(`${this.publicBaseUrl}/`, '')
      : urlOrKey;
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => {});
  }
}
```

Variáveis de ambiente necessárias (adicione ao `.env.example`):
```
STORAGE_BUCKET=
STORAGE_REGION=
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_PUBLIC_URL=
STORAGE_ENDPOINT=   # opcional — para R2/MinIO
```

Instale os pacotes:
```bash
npm install --save-dev @types/multer
# + pacote do provider escolhido, ex:
npm install @aws-sdk/client-s3
```

---

## Parte 10 — Registro do StorageModule

Em `src/app.module.ts`, importe `StorageModule`:

```typescript
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    // ... outros módulos ...
    StorageModule,
  ],
})
export class AppModule {}
```

---

## Parte 11 — `RestaurantModule` atualizado

Em `src/modules/restaurant/restaurant.module.ts`:

```typescript
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Restaurant,
      Product,
      RestaurantReview,  // novo
      Order,             // para validar pedido entregue
      PaymentMethod,     // para métodos aceitos
    ]),
    StorageModule,       // injeta StorageService no RestaurantService
  ],
  // ...
})
export class RestaurantModule {}
```

---

## Parte 12 — Checklist de verificação

```bash
# Gerar e rodar migration
npm run migration:generate -- src/database/migrations/AddRestaurantExtras
npm run migration:run

# Build sem erros
npm run build

# Subir em dev
npm run start:dev

# Busca avançada com coordenadas e raio
curl "http://localhost:3000/api/v1/restaurants/search?lat=-23.5505&lng=-46.6333&radiusKm=10&onlyOpen=true&sortBy=distance"

# Destaques
curl "http://localhost:3000/api/v1/restaurants/featured"

# Próximos com filtro de raio
curl "http://localhost:3000/api/v1/restaurants/nearby?lat=-23.5505&lng=-46.6333&radiusKm=5&onlyOpen=true&limit=5"

# Menor tempo de entrega
curl "http://localhost:3000/api/v1/restaurants/fastest?lat=-23.5505&lng=-46.6333&limit=5"

# Avaliação (token de customer com pedido DELIVERED)
curl -X POST http://localhost:3000/api/v1/restaurants/<id>/reviews \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"<order_id>","rating":5,"comment":"Excelente!"}'

# Listar avaliações
curl "http://localhost:3000/api/v1/restaurants/<id>/reviews?minRating=4&page=1&limit=10"

# Métodos de pagamento
curl "http://localhost:3000/api/v1/restaurants/<id>/payment-methods"

# Atualizar métodos (owner)
curl -X PUT http://localhost:3000/api/v1/restaurants/<id>/payment-methods \
  -H "Authorization: Bearer <owner_token>" \
  -H "Content-Type: application/json" \
  -d '{"paymentMethodIds":["<pix_id>","<credit_card_id>"]}'

# Upload de logo (retorna { url: "https://..." })
curl -X POST http://localhost:3000/api/v1/restaurants/<id>/images/logo \
  -H "Authorization: Bearer <owner_token>" \
  -F "file=@/path/to/logo.png"

# A URL retornada é a URL pública no storage (CDN, S3, etc.)
```

---

## Critérios de aceite

| Critério | Validação |
|---|---|
| `/nearby?lat&lng&radiusKm` retorna ordenado por distância crescente | Verificado manualmente |
| `/nearby` sem `radiusKm` usa raio padrão de 5 km | Verificado manualmente |
| `distanceKm` e `adjustedDeliveryMinutes` presentes no retorno | JSON inspecionado |
| `/search` combina todos os filtros simultaneamente | Combinação de params testada |
| `/featured` retorna somente `isFeatured=true` e `isOpen=true` | Verificado manualmente |
| Cliente só avalia pedido `DELIVERED` que lhe pertence | Status diferente → 400 |
| Avaliação duplicada (mesmo `orderId`) → 409 | Segunda chamada testada |
| `averageRating` e `totalReviews` atualizados após avaliação | `GET /restaurants/:id` verificado |
| Apenas dono atualiza métodos de pagamento e faz upload | Outro usuário → 403 |
| Upload rejeita arquivos > 5 MB e não-imagens | PDF → 400 |
| `uploadImage` retorna URL pública do storage (não path local) | JSON `{ url: "https://..." }` |
| `logoUrl` / `bannerUrl` salvo no banco é a URL pública | `GET /restaurants/:id` verificado |
| Troca de imagem apaga a anterior no storage | Log do provider verificado |
| Rotas literais (`/search`, `/featured`, etc.) não conflitam com `/:id` | Verificado |

---

## Parte 13 — Favoritar restaurante

### 13.1 Entidade `UserFavoriteRestaurant`

**`src/modules/restaurant/entities/user-favorite-restaurant.entity.ts`**:

```typescript
import {
  CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';

@Entity('user_favorite_restaurants')
@Index('IDX_favorite_user', ['userId'])
@Index('IDX_favorite_restaurant', ['restaurantId'])
export class UserFavoriteRestaurant {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'uuid' })
  restaurantId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: any;

  @ManyToOne('Restaurant', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurantId' })
  restaurant!: any;
}
```

### 13.2 Campo `deliveryFee` no `Restaurant`

Adicione em `restaurant.entity.ts` (antes de `logoUrl`):

```typescript
/** Taxa de entrega em reais. 0 = entrega grátis. */
@Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
deliveryFee!: number;
```

Adicione também em `CreateRestaurantDto` e `UpdateRestaurantDto` (via PartialType):

```typescript
@IsOptional()
@Type(() => Number)
@IsNumber({ maxDecimalPlaces: 2 })
@Min(0)
deliveryFee?: number = 0;
```

### 13.3 DTO `SetDeliveryFeeDto`

**`src/modules/restaurant/dto/set-delivery-fee.dto.ts`**:

```typescript
import { IsNumber, Min, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class SetDeliveryFeeDto {
  /** Taxa de entrega em reais. Use 0 para entrega grátis. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryFee!: number;

  /** Se true, entrega grátis (equivalente a deliveryFee = 0) */
  @IsOptional()
  @IsBoolean()
  isFreeDelivery?: boolean;
}
```

### 13.4 Métodos no `RestaurantService`

Injete o repositório de favoritos e adicione os métodos:

```typescript
// No construtor:
@InjectRepository(UserFavoriteRestaurant)
private readonly favoriteRepository: Repository<UserFavoriteRestaurant>,

// Métodos:

async toggleFavorite(restaurantId: string, userId: string): Promise<{ favorited: boolean }> {
  await this.findOne(restaurantId); // garante que existe
  const existing = await this.favoriteRepository.findOne({
    where: { restaurantId, userId },
  });
  if (existing) {
    await this.favoriteRepository.remove(existing);
    return { favorited: false };
  }
  await this.favoriteRepository.save(
    this.favoriteRepository.create({ restaurantId, userId }),
  );
  return { favorited: true };
}

async findFavorites(userId: string): Promise<Restaurant[]> {
  const favs = await this.favoriteRepository.find({
    where: { userId },
    relations: ['restaurant'],
    order: { createdAt: 'DESC' },
  });
  return favs.map((f) => f.restaurant);
}

async isFavorited(restaurantId: string, userId: string): Promise<{ favorited: boolean }> {
  const exists = await this.favoriteRepository.findOne({
    where: { restaurantId, userId },
  });
  return { favorited: !!exists };
}

/** Somente admin pode definir a taxa de entrega. */
async setDeliveryFee(restaurantId: string, dto: SetDeliveryFeeDto): Promise<Restaurant> {
  const restaurant = await this.findOne(restaurantId);
  restaurant.deliveryFee = dto.isFreeDelivery ? 0 : dto.deliveryFee;
  return this.restaurantRepository.save(restaurant);
}
```

### 13.5 Endpoints no `RestaurantController`

Adicione **antes** de `@Get(':id')`:

```typescript
// Favoritos do customer logado
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('customer')
@Get('favorites/my')
getMyFavorites(@CurrentUser() user: any) {
  return this.restaurantService.findFavorites(user.id);
}

// Admin define taxa de entrega
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Patch(':id/delivery-fee')
setDeliveryFee(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: SetDeliveryFeeDto,
) {
  return this.restaurantService.setDeliveryFee(id, dto);
}
```

Adicione **dentro** da seção de rotas com `:id`:

```typescript
// Toggle favorito (customer)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('customer')
@Post(':id/favorite')
toggleFavorite(
  @Param('id', ParseUUIDPipe) restaurantId: string,
  @CurrentUser() user: any,
) {
  return this.restaurantService.toggleFavorite(restaurantId, user.id);
}

// Verificar se está favoritado
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('customer')
@Get(':id/favorite')
isFavorited(
  @Param('id', ParseUUIDPipe) restaurantId: string,
  @CurrentUser() user: any,
) {
  return this.restaurantService.isFavorited(restaurantId, user.id);
}
```

### 13.6 Atualizar `RestaurantModule`

Adicione `UserFavoriteRestaurant` ao `forFeature`:

```typescript
TypeOrmModule.forFeature([
  Restaurant,
  Product,
  RestaurantReview,
  Order,
  PaymentMethod,
  UserFavoriteRestaurant, // novo
]),
```

### 13.7 Migration

```bash
npm run migration:generate -- src/database/migrations/AddFavoritesAndDeliveryFee
npm run migration:run
```

A migration deve criar:
- `CREATE TABLE user_favorite_restaurants ("userId" uuid, "restaurantId" uuid, "createdAt" timestamp, PK ambas as colunas)`
- `ALTER TABLE restaurants ADD COLUMN "deliveryFee" numeric(8,2) NOT NULL DEFAULT 0`

### 13.8 Endpoints resumo desta parte

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| `POST` | `/restaurants/:id/favorite` | customer | Favoritar / desfavoritar (toggle) |
| `GET` | `/restaurants/:id/favorite` | customer | Verificar se está favoritado |
| `GET` | `/restaurants/favorites/my` | customer | Listar meus restaurantes favoritados |
| `PATCH` | `/restaurants/:id/delivery-fee` | admin | Definir taxa de entrega (0 = grátis) |

### 13.9 Seed atualizado (exemplo)

No `seed.ts`, após salvar os restaurantes:

```typescript
// Inicializar com deliveryFee
burger.deliveryFee = 5.99;  // R$ 5,99
pizza.deliveryFee  = 0;     // grátis
sushi.deliveryFee  = 8.99;  // R$ 8,99
await restaurantRepo.save([burger, pizza, sushi]);

// Favoritos de exemplo
const favoriteRepo = AppDataSource.getRepository(UserFavoriteRestaurant);
await favoriteRepo.save([
  favoriteRepo.create({ userId: maria.id, restaurantId: burger.id }),
  favoriteRepo.create({ userId: maria.id, restaurantId: pizza.id }),
  favoriteRepo.create({ userId: carlos.id, restaurantId: pizza.id }),
]);
```

### 13.10 Critérios de aceite adicionais

| Critério | Validação |
|---|---|
| `POST /restaurants/:id/favorite` retorna `{ favorited: true }` na 1ª chamada | Verificado |
| Segunda chamada ao mesmo endpoint retorna `{ favorited: false }` (toggle) | Verificado |
| `GET /restaurants/favorites/my` retorna lista de restaurantes do customer | JSON verificado |
| `GET /restaurants/:id/favorite` retorna status atual sem mudar nada | Verificado |
| `PATCH /restaurants/:id/delivery-fee` com `isFreeDelivery: true` salva `deliveryFee = 0` | DB verificado |
| Apenas `admin` pode alterar taxa de entrega — customer/owner → 403 | Verificado |
| Campo `deliveryFee` retornado em `GET /restaurants/:id` | JSON verificado |
| Ao deletar restaurante, favoritos são removidos em cascata | FK ON DELETE CASCADE verificado |

