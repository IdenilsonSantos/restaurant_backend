---
name: e-categories
description: Agente de Categorias e Tags — sistema de categorização de restaurantes e produtos com tags pré-definidas (Popular, Fast Delivery, High Class, Dine In, Pick Up, Nearest) gerenciadas por admin. Depende das E3 e E-Products.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pelo módulo de **Categorias e Tags**.

## Pré-requisito
PRs das E3 e E-Products mergeados na `main`. As entidades `Restaurant` e `Product` já existem.

---

## Visão geral

O sistema de categorias permite ao admin classificar restaurantes e produtos com tags semânticas. As tags têm dois âmbitos:

- **Tags de restaurante**: Popular, Fast Delivery, High Class, Dine In, Pick Up, Nearest (baseado em lógica de proximidade)
- **Tags de produto**: Popular, Recommended, Vegan, Spicy, Gluten Free, New, etc.

Tags padrão do sistema são criadas via seed e gerenciadas por admin. Usuários veem os resultados filtrados e ordenados por tag.

---

## Parte 1 — Entidades

### `src/modules/category/entities/tag.entity.ts`

```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum TagScope {
  RESTAURANT = 'restaurant',
  PRODUCT = 'product',
  BOTH = 'both',
}

@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Nome exibido: 'Popular', 'Fast Delivery', 'High Class', etc. */
  @Column({ type: 'varchar', unique: true })
  name!: string;

  /** Slug para uso em queries: 'popular', 'fast_delivery', 'high_class' */
  @Column({ type: 'varchar', unique: true })
  slug!: string;

  /** Ícone/emoji para exibição na UI (opcional) */
  @Column({ type: 'varchar', nullable: true })
  icon!: string | null;

  /** Cor hex para badge (#FF5733) */
  @Column({ type: 'varchar', nullable: true })
  color!: string | null;

  /** Âmbito: aplica a restaurante, produto ou ambos */
  @Column({ type: 'enum', enum: TagScope, default: TagScope.RESTAURANT })
  scope!: TagScope;

  /** Se false, tag não aparece para usuários */
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** Ordem de exibição (menor = aparece primeiro) */
  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  /**
   * Se true, atribuída automaticamente por algoritmo (ex: 'nearest' calculado por GEO,
   * 'popular' calculado por totalOrders). Se false, atribuída manualmente pelo admin.
   */
  @Column({ type: 'boolean', default: false })
  isAutomatic!: boolean;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
```

---

### `src/modules/category/entities/restaurant-tag.entity.ts`

```typescript
import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

@Entity('restaurant_tags')
@Index('IDX_restaurant_tag_restaurant', ['restaurantId'])
@Index('IDX_restaurant_tag_tag', ['tagId'])
export class RestaurantTag {
  @PrimaryColumn({ type: 'uuid' }) restaurantId!: string;
  @PrimaryColumn({ type: 'uuid' }) tagId!: string;

  @CreateDateColumn() assignedAt!: Date;

  @ManyToOne('Restaurant', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurantId' })
  restaurant!: any;

  @ManyToOne('Tag', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tagId' })
  tag!: any;
}
```

---

### `src/modules/category/entities/product-tag.entity.ts`

```typescript
import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

@Entity('product_tags')
@Index('IDX_product_tag_product', ['productId'])
@Index('IDX_product_tag_tag', ['tagId'])
export class ProductTag {
  @PrimaryColumn({ type: 'uuid' }) productId!: string;
  @PrimaryColumn({ type: 'uuid' }) tagId!: string;

  @CreateDateColumn() assignedAt!: Date;

  @ManyToOne('Product', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: any;

  @ManyToOne('Tag', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tagId' })
  tag!: any;
}
```

---

## Parte 2 — Tags padrão (seed)

`src/database/seeds/tags.seed.ts`:

```typescript
export const DEFAULT_TAGS = [
  // Tags de restaurante
  { name: 'Popular',       slug: 'popular',       scope: TagScope.RESTAURANT, displayOrder: 0, icon: '🔥', color: '#FF5733', isAutomatic: true },
  { name: 'Fast Delivery', slug: 'fast_delivery',  scope: TagScope.RESTAURANT, displayOrder: 1, icon: '⚡', color: '#FFC300', isAutomatic: true },
  { name: 'High Class',    slug: 'high_class',     scope: TagScope.RESTAURANT, displayOrder: 2, icon: '⭐', color: '#8B0000', isAutomatic: false },
  { name: 'Dine In',       slug: 'dine_in',        scope: TagScope.RESTAURANT, displayOrder: 3, icon: '🍽️', color: '#2ECC71', isAutomatic: false },
  { name: 'Pick Up',       slug: 'pick_up',        scope: TagScope.RESTAURANT, displayOrder: 4, icon: '🛍️', color: '#3498DB', isAutomatic: false },
  { name: 'Nearest',       slug: 'nearest',        scope: TagScope.RESTAURANT, displayOrder: 5, icon: '📍', color: '#9B59B6', isAutomatic: true },

  // Tags de produto
  { name: 'Popular',       slug: 'popular_product', scope: TagScope.PRODUCT, displayOrder: 0, icon: '🔥', isAutomatic: true },
  { name: 'Recommended',   slug: 'recommended',     scope: TagScope.PRODUCT, displayOrder: 1, icon: '👍', isAutomatic: false },
  { name: 'Vegan',         slug: 'vegan',           scope: TagScope.PRODUCT, displayOrder: 2, icon: '🌱', isAutomatic: false },
  { name: 'Spicy',         slug: 'spicy',           scope: TagScope.PRODUCT, displayOrder: 3, icon: '🌶️', isAutomatic: false },
  { name: 'Gluten Free',   slug: 'gluten_free',     scope: TagScope.PRODUCT, displayOrder: 4, icon: '🌾', isAutomatic: false },
  { name: 'New',           slug: 'new',             scope: TagScope.PRODUCT, displayOrder: 5, icon: '✨', isAutomatic: false },
];
```

Script de seed: inserir tags com `upsert` para não duplicar.

---

## Parte 3 — DTOs

`src/modules/category/dto/create-tag.dto.ts`:
```typescript
export class CreateTagDto {
  @IsString() @MinLength(2) name: string;
  @IsString() @Matches(/^[a-z0-9_]+$/) slug: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() @Matches(/^#[0-9A-Fa-f]{6}$/) color?: string;
  @IsEnum(TagScope) scope: TagScope;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() isAutomatic?: boolean;
}
```

`update-tag.dto.ts` — PartialType de CreateTagDto.

`assign-tags.dto.ts`:
```typescript
export class AssignTagsDto {
  @IsArray() @IsUUID('4', { each: true })
  tagIds: string[];
}
```

---

## Parte 4 — TagService (`src/modules/category/tag.service.ts`)

```typescript
@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag) private tagRepo: Repository<Tag>,
    @InjectRepository(RestaurantTag) private restaurantTagRepo: Repository<RestaurantTag>,
    @InjectRepository(ProductTag) private productTagRepo: Repository<ProductTag>,
    @InjectRepository(Restaurant) private restaurantRepo: Repository<Restaurant>,
    private readonly redisService: RedisService,
  ) {}

  // ── CRUD de tags (admin) ─────────────────────────────────────────────────

  async create(dto: CreateTagDto): Promise<Tag>
  async findAll(scope?: TagScope): Promise<Tag[]>  // filtrar por scope se fornecido
  async findOne(id: string): Promise<Tag>
  async update(id: string, dto: UpdateTagDto): Promise<Tag>
  async remove(id: string): Promise<void>  // soft-disable: isActive = false

  // ── Atribuição a restaurantes (admin) ────────────────────────────────────

  async assignTagsToRestaurant(restaurantId: string, dto: AssignTagsDto): Promise<Tag[]> {
    // Verificar que as tags existem e scope é RESTAURANT ou BOTH
    // Fazer upsert nas restaurantTags
    // Invalidar cache do restaurante
  }

  async removeTagFromRestaurant(restaurantId: string, tagId: string): Promise<void>

  async findRestaurantTags(restaurantId: string): Promise<Tag[]>

  // ── Atribuição a produtos (admin) ────────────────────────────────────────

  async assignTagsToProduct(productId: string, dto: AssignTagsDto): Promise<Tag[]>
  async removeTagFromProduct(productId: string, tagId: string): Promise<void>
  async findProductTags(productId: string): Promise<Tag[]>

  // ── Busca por tag (público) ──────────────────────────────────────────────

  async findRestaurantsByTag(tagSlug: string, page: number, limit: number): Promise<PaginatedResult<Restaurant>> {
    const tag = await this.tagRepo.findOne({ where: { slug: tagSlug, isActive: true } });
    if (!tag) throw new NotFoundException(`Tag '${tagSlug}' not found`);

    const [data, total] = await this.restaurantRepo.createQueryBuilder('r')
      .innerJoin('r.restaurantTags', 'rt')
      .where('rt.tagId = :tagId', { tagId: tag.id })
      .andWhere('r.isOpen = true')
      .orderBy('r.totalOrders', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findProductsByTag(tagSlug: string, page: number, limit: number): Promise<PaginatedResult<Product>>

  // ── Automação de tags ────────────────────────────────────────────────────

  /**
   * Atribui 'popular' automaticamente a restaurantes com totalOrders > threshold.
   * Chamado periodicamente (ex: cron job ou ao atualizar um pedido).
   */
  async refreshPopularTag(threshold = 50): Promise<void>

  /**
   * Atribui 'fast_delivery' a restaurantes com estimatedDeliveryMinutes <= maxMinutes.
   */
  async refreshFastDeliveryTag(maxMinutes = 30): Promise<void>
}
```

**Cache:** chave `tags:all` TTL 3600s (1h) para `findAll`. Invalida ao criar/atualizar/remover tag.

---

## Parte 5 — TagController (`src/modules/category/tag.controller.ts`)

```
# Admin — gerenciar tags
POST   /tags               → create (@Roles('admin'))
GET    /tags               → findAll (público, ?scope=restaurant|product)
GET    /tags/:id           → findOne (público)
PATCH  /tags/:id           → update (@Roles('admin'))
DELETE /tags/:id           → remove (@Roles('admin'))

# Admin — atribuição a restaurantes
POST   /restaurants/:id/tags        → assignTagsToRestaurant (@Roles('admin'))
DELETE /restaurants/:id/tags/:tagId → removeTagFromRestaurant (@Roles('admin'))
GET    /restaurants/:id/tags        → findRestaurantTags (público)

# Admin — atribuição a produtos
POST   /restaurants/:restaurantId/products/:productId/tags        → assignTagsToProduct (@Roles('admin'))
DELETE /restaurants/:restaurantId/products/:productId/tags/:tagId → removeTagFromProduct (@Roles('admin'))
GET    /restaurants/:restaurantId/products/:productId/tags        → findProductTags (público)

# Busca por tag (público)
GET    /tags/:slug/restaurants → findRestaurantsByTag
GET    /tags/:slug/products    → findProductsByTag
```

---

## Parte 6 — CategoryModule

`src/modules/category/category.module.ts`:
```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Tag, RestaurantTag, ProductTag, Restaurant, Product]),
  ],
  providers: [TagService],
  controllers: [TagController],
  exports: [TagService],
})
export class CategoryModule {}
```

Importar `CategoryModule` no `AppModule`.

---

## Parte 7 — Relacionamentos nas entidades existentes

Adicionar em `restaurant.entity.ts`:
```typescript
@OneToMany('RestaurantTag', 'restaurant', { cascade: true })
restaurantTags!: any[];
```

Adicionar em `product.entity.ts`:
```typescript
@OneToMany('ProductTag', 'product', { cascade: true })
productTags!: any[];
```

---

## Parte 8 — Migration

```bash
npm run migration:generate -- src/database/migrations/AddTagsAndCategories
npm run migration:run
```

Migration deve criar:
- `tags` (id, name, slug, icon, color, scope, isActive, displayOrder, isAutomatic, createdAt, updatedAt)
- `restaurant_tags` (restaurantId PK, tagId PK, assignedAt) + índices + FKs com CASCADE
- `product_tags` (productId PK, tagId PK, assignedAt) + índices + FKs com CASCADE

Após migration, rodar seed de tags padrão:
```bash
npx ts-node src/database/seeds/tags.seed.ts
```

---

## Fluxo de commit e PR

```bash
git checkout main && git pull origin main
git checkout -b feat/categories-tags
git add src/modules/category src/database/seeds/tags.seed.ts src/database/migrations/AddTagsAndCategories*
git commit -m "feat: add tags/categories system for restaurants and products"
git push origin feat/categories-tags
gh pr create \
  --title "feat: Tags and Categories system" \
  --base main \
  --body "## O que foi feito
- Entidade Tag com scope (restaurant/product/both), slug, icon, color
- Tags pré-definidas: Popular, Fast Delivery, High Class, Dine In, Pick Up, Nearest
- RestaurantTag e ProductTag: tabelas de junção com índices
- TagService com CRUD, atribuição e busca por tag
- Tags automáticas: Popular (por totalOrders) e Fast Delivery (por estimatedDeliveryMinutes)
- Endpoints públicos de busca por slug de tag
- Cache Redis para listagem de tags (TTL 1h)
- Seed com 12 tags padrão

## Depende de
PRs E3 e E-Products mergeados

## Tags padrão
Restaurante: Popular, Fast Delivery, High Class, Dine In, Pick Up, Nearest
Produto: Popular, Recommended, Vegan, Spicy, Gluten Free, New"
```

## Regras
- Slug único e imutável após criação — usado como identificador em URLs
- Tags automáticas (`isAutomatic: true`) são gerenciadas por `refreshPopularTag/refreshFastDeliveryTag` — admin não atribui manualmente
- Tags de produto devem ter `scope = product` ou `scope = both`
- Tags de restaurante devem ter `scope = restaurant` ou `scope = both`
- `remove` faz soft-disable (`isActive = false`), não deleta do banco
