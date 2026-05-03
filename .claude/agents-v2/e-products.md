---
name: e-products
description: Agente de Produtos avançados — rating individual de produto, tempo de preparação, origem/categoria culinária (Japonesa, Italiana, etc.), relação com tempo de entrega do restaurante, e vínculo com grupos de opções. Depende das E3 e E5.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pelo módulo de **Produtos Avançados**.

## Pré-requisito
PRs das E3 e E5 mergeados na `main`. As entidades `Product`, `ProductOptionGroup` e `ProductOption` já existem.

---

## Parte 1 — Novos campos na entidade `Product`

Adicione em `src/modules/restaurant/entities/product.entity.ts`:

```typescript
/** Tempo estimado de preparo em minutos (ex: 10 = 10 min) */
@Column({ type: 'int', default: 10 })
preparationMinutes!: number;

/** Média de avaliações do produto (0 = sem avaliações) */
@Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
averageRating!: number;

/** Total de avaliações recebidas */
@Column({ type: 'int', default: 0 })
totalRatings!: number;

/** Categoria culinária: ex: 'Japonesa', 'Italiana', 'Brasileira', 'Árabe' */
@Column({ type: 'varchar', nullable: true })
cuisineOrigin!: string | null;

/** URL da imagem principal (já existe como imageUrl — verificar e manter) */
// imageUrl já existe na entidade

/** Destaque (admin pode marcar produtos em destaque) */
@Column({ type: 'boolean', default: false })
isFeatured!: boolean;

/** Calorias (informação nutricional opcional) */
@Column({ type: 'int', nullable: true })
calories!: number | null;
```

---

## Parte 2 — Entidade `ProductRating`

`src/modules/restaurant/entities/product-rating.entity.ts`:

```typescript
import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique,
} from 'typeorm';

@Entity('product_ratings')
@Unique('UQ_product_rating_customer_order', ['customerId', 'orderItemId'])
export class ProductRating {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  productId!: string;

  @Index()
  @Column({ type: 'uuid' })
  customerId!: string;

  /** Garante que o cliente realmente pediu o produto */
  @Column({ type: 'uuid' })
  orderItemId!: string;

  /** Nota de 1 a 5 */
  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne('Product', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: any;

  @ManyToOne('User')
  @JoinColumn({ name: 'customerId' })
  customer!: any;

  @ManyToOne('OrderItem')
  @JoinColumn({ name: 'orderItemId' })
  orderItem!: any;
}
```

---

## Parte 3 — DTO de rating de produto

`src/modules/restaurant/dto/create-product-rating.dto.ts`:
```typescript
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateProductRatingDto {
  @IsUUID()
  orderItemId!: string;

  @IsInt() @Min(1) @Max(5)
  rating!: number;

  @IsOptional() @IsString()
  comment?: string;
}
```

`src/modules/restaurant/dto/update-product.dto.ts` — estender com os novos campos:
```typescript
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional() @IsInt() @Min(0) @Max(300)
  preparationMinutes?: number;

  @IsOptional() @IsString()
  cuisineOrigin?: string;

  @IsOptional() @IsBoolean()
  isFeatured?: boolean;

  @IsOptional() @IsInt() @Min(0)
  calories?: number;
}
```

`src/modules/restaurant/dto/create-product.dto.ts` — adicionar campos novos:
```typescript
@IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(300)
preparationMinutes?: number = 10;

@IsOptional() @IsString()
cuisineOrigin?: string;

@IsOptional() @IsBoolean()
isFeatured?: boolean = false;

@IsOptional() @Type(() => Number) @IsInt() @Min(0)
calories?: number;
```

---

## Parte 4 — ProductService (métodos novos)

Adicionar ao `RestaurantService` ou criar um `ProductService` dedicado em `src/modules/restaurant/product.service.ts`:

```typescript
/**
 * Tempo total estimado = preparationMinutes do produto + estimatedDeliveryMinutes do restaurante
 * Retornado junto com o produto nas listagens para facilitar o cliente.
 */
async findProductWithDeliveryTime(productId: string): Promise<Product & { totalMinutes: number }> {
  const product = await this.productRepository.findOne({
    where: { id: productId },
    relations: ['restaurant', 'optionGroups', 'optionGroups.options'],
  });
  if (!product) throw new NotFoundException(`Product ${productId} not found`);

  const totalMinutes = product.preparationMinutes + product.restaurant.estimatedDeliveryMinutes;
  return { ...product, totalMinutes };
}

async rateProduct(productId: string, customerId: string, dto: CreateProductRatingDto): Promise<ProductRating> {
  // 1. Verificar que o orderItem pertence ao customer e ao produto
  const orderItem = await this.orderItemRepository.findOne({
    where: { id: dto.orderItemId, productId },
    relations: ['order'],
  });
  if (!orderItem || orderItem.order.customerId !== customerId) {
    throw new NotFoundException('Order item not found or does not belong to you');
  }
  if (orderItem.order.status !== OrderStatus.DELIVERED) {
    throw new BadRequestException('Product can only be rated after delivery');
  }

  // 2. Verificar se já avaliou
  const existing = await this.productRatingRepository.findOne({
    where: { customerId, orderItemId: dto.orderItemId },
  });
  if (existing) throw new ConflictException('You already rated this product');

  // 3. Salvar rating
  const rating = this.productRatingRepository.create({
    productId, customerId, orderItemId: dto.orderItemId,
    rating: dto.rating, comment: dto.comment ?? null,
  });
  const saved = await this.productRatingRepository.save(rating);

  // 4. Recalcular averageRating e totalRatings via SQL
  await this.productRepository.createQueryBuilder()
    .update()
    .set({
      averageRating: () => `(SELECT ROUND(AVG(rating)::numeric, 2) FROM product_ratings WHERE "productId" = '${productId}')`,
      totalRatings: () => `(SELECT COUNT(*) FROM product_ratings WHERE "productId" = '${productId}')`,
    })
    .where('id = :id', { id: productId })
    .execute();

  return saved;
}

async findProductRatings(productId: string, dto: PaginationDto): Promise<PaginatedResult<ProductRating>> {
  const [data, total] = await this.productRatingRepository.findAndCount({
    where: { productId },
    relations: ['customer'],
    order: { createdAt: 'DESC' },
    skip: ((dto.page ?? 1) - 1) * (dto.limit ?? 10),
    take: dto.limit ?? 10,
  });
  return { data, total, page: dto.page ?? 1, limit: dto.limit ?? 10, totalPages: Math.ceil(total / (dto.limit ?? 10)) };
}

async findFeaturedProducts(restaurantId: string): Promise<Product[]> {
  return this.productRepository.find({
    where: { restaurantId, isAvailable: true, isFeatured: true },
    order: { averageRating: 'DESC' },
  });
}

async findByCuisineOrigin(origin: string, page: number, limit: number): Promise<PaginatedResult<Product>> {
  const [data, total] = await this.productRepository.findAndCount({
    where: { cuisineOrigin: origin, isAvailable: true },
    relations: ['restaurant'],
    skip: (page - 1) * limit,
    take: limit,
    order: { averageRating: 'DESC' },
  });
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}
```

---

## Parte 5 — Endpoints no RestaurantController

Adicionar (antes de `/:id` para evitar conflito):

```
GET  /restaurants/:restaurantId/products/featured   → findFeaturedProducts (público)
POST /restaurants/:restaurantId/products/:productId/ratings → rateProduct (@Roles('customer'))
GET  /restaurants/:restaurantId/products/:productId/ratings → findProductRatings (público)
GET  /restaurants/:restaurantId/products/:productId         → findProductWithDeliveryTime (público)
GET  /products/cuisine/:origin                              → findByCuisineOrigin (público)
```

> O campo `totalMinutes` (preparação + entrega estimada) retornado em `findProductWithDeliveryTime` ajuda o cliente a ver o tempo total esperado da experiência.

---

## Parte 6 — Cache Redis

- Chave `product:{id}:detail` TTL 300s para `findProductWithDeliveryTime`
- Invalidar ao atualizar produto via `RestaurantService.updateProduct`
- A chave `product:{id}:option-groups` (da E5) continua separada

---

## Parte 7 — Migration

```bash
npm run migration:generate -- src/database/migrations/AddProductExtras
npm run migration:run
```

Migration deve:
- Adicionar colunas à tabela `products`: `preparationMinutes`, `averageRating`, `totalRatings`, `cuisineOrigin`, `isFeatured`, `calories`
- Criar tabela `product_ratings`

---

## Atualizar RestaurantModule

Adicionar ao `TypeOrmModule.forFeature([...])`:
- `ProductRating`
- `OrderItem` (para validação de rating)

---

## Fluxo de commit e PR

```bash
git checkout main && git pull origin main
git checkout -b feat/products-advanced
git add src/modules/restaurant/entities/product-rating.entity.ts \
        src/modules/restaurant/dto/create-product-rating.dto.ts \
        src/database/migrations/AddProductExtras*
git commit -m "feat: add product ratings, preparation time, cuisine origin and featured products"
git push origin feat/products-advanced
gh pr create \
  --title "feat: Products - ratings, preparation time, cuisine origin" \
  --base main \
  --body "## O que foi feito
- ProductRating: cliente avalia produto após entrega (unique por orderItemId)
- averageRating e totalRatings recalculados via SQL após cada avaliação
- preparationMinutes: tempo estimado de preparo por produto
- totalMinutes = preparationMinutes + restaurant.estimatedDeliveryMinutes (retornado nas consultas)
- cuisineOrigin: categoria culinária (Japonesa, Italiana, Brasileira...)
- isFeatured: admin destaca produtos
- calories: informação nutricional opcional
- Endpoint /products/cuisine/:origin para buscar por tipo de culinária

## Depende de
PRs E3 e E5 mergeados"
```

## Regras
- Rating de produto só é permitido após pedido `DELIVERED`
- Um `orderItemId` só pode ter um rating (unique)
- `totalMinutes` NUNCA salvo no banco — calculado dinamicamente somando produto + restaurante
- Cache do detalhe do produto invalidado sempre que `preparationMinutes` ou outros campos mudarem
