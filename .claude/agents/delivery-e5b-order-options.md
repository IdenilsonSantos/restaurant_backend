---
name: delivery-e5b-order-options
description: Etapa 5B do sistema de delivery — adiciona grupos de opções configuráveis por produto (ex: "Escolha o acompanhamento": Arroz, Feijão) gerenciados pelo admin do restaurante, com snapshot e validação de seleções no momento do pedido. Depende das Etapas 3 (produtos) e 5 (pedidos).
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 5B — Product Option Groups & Order Options** do sistema de delivery.

## Pré-requisito

PRs das Etapas 1, 2, 3, 5 e 7 mergeados na `main`.  
As entidades `Product`, `OrderItem` e `Order` já existem em `src/modules/restaurant/entities/` e `src/modules/order/entities/`.  
`RedisService` disponível globalmente via `RedisModule.forRoot()` — não precisa importar o módulo explicitamente.

---

## Visão geral da feature

Restaurantes podem definir **grupos de opções** por produto — por exemplo, um produto "Arroz e Feijão" pode ter o grupo "Escolha o acompanhamento" com as opções "Arroz", "Feijão" ou "Ambos". Cada grupo tem regras de seleção (mínimo, máximo, obrigatório). Ao fazer um pedido, o cliente envia as opções escolhidas; o sistema valida as regras e grava um snapshot imutável junto ao item do pedido.

---

## Parte 1 — Novas entidades

### `src/modules/restaurant/entities/product-option-group.entity.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('product_option_groups')
export class ProductOptionGroup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  productId!: string;

  /** Ex: "Escolha o acompanhamento", "Tamanho da porção" */
  @Column({ type: 'varchar' })
  name!: string;

  /** Exibido ao cliente como instrução opcional */
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Se true, o cliente DEVE selecionar ao menos minSelections opções */
  @Column({ type: 'boolean', default: false })
  required!: boolean;

  /** Mínimo de opções que devem ser selecionadas (0 = nenhum mínimo) */
  @Column({ type: 'int', default: 0 })
  minSelections!: number;

  /** Máximo de opções permitidas (1 = seleção única, >1 = múltipla escolha) */
  @Column({ type: 'int', default: 1 })
  maxSelections!: number;

  /** Controla se o grupo aparece para o cliente */
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** Ordem de exibição na UI */
  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne('Product', 'optionGroups', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: any;

  @OneToMany('ProductOption', 'group', { cascade: true, eager: true })
  options!: any[];
}
```

### `src/modules/restaurant/entities/product-option.entity.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('product_options')
export class ProductOption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  groupId!: string;

  /** Ex: "Arroz", "Feijão", "Ambos" */
  @Column({ type: 'varchar' })
  name!: string;

  /**
   * Valor adicionado ao preço base do produto quando esta opção é selecionada.
   * Use 0 para opções sem custo adicional.
   */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  priceModifier!: number;

  @Column({ type: 'boolean', default: true })
  isAvailable!: boolean;

  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne('ProductOptionGroup', 'options', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group!: any;
}
```

### `src/modules/order/entities/order-item-option.entity.ts`

```typescript
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Snapshot imutável das opções selecionadas pelo cliente no momento do pedido.
 * Nunca referenciar ProductOptionGroup ou ProductOption diretamente após a criação —
 * usar apenas os campos de snapshot.
 */
@Entity('order_item_options')
export class OrderItemOption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  orderItemId!: string;

  // — Snapshot do grupo —
  @Column({ type: 'uuid' })
  optionGroupId!: string;

  @Column({ type: 'varchar' })
  optionGroupName!: string;

  // — Snapshot da opção —
  @Column({ type: 'uuid' })
  optionId!: string;

  @Column({ type: 'varchar' })
  optionName!: string;

  /** Valor adicional cobrado pela opção — snapshot no momento do pedido */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  priceModifier!: number;

  @ManyToOne('OrderItem', 'selectedOptions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderItemId' })
  orderItem!: any;
}
```

---

## Parte 2 — Modificar entidades existentes

### `src/modules/restaurant/entities/product.entity.ts`

Adicione a relação com os grupos de opções:

```typescript
@OneToMany('ProductOptionGroup', 'product', { cascade: true })
optionGroups!: any[];
```

Adicione o import `OneToMany` se ainda não estiver presente.

### `src/modules/order/entities/order-item.entity.ts`

Adicione a relação com as opções selecionadas:

```typescript
@OneToMany('OrderItemOption', 'orderItem', { cascade: true, eager: true })
selectedOptions!: any[];
```

Adicione o import `OneToMany` se ainda não estiver presente.

---

## Parte 3 — Migration

Gere e revise a migration consolidada:

```bash
npm run migration:generate -- src/database/migrations/AddProductOptionsAndOrderItemOptions
npm run migration:run
```

A migration deve criar:

1. **`product_option_groups`**
   - `id uuid PK`
   - `productId uuid NOT NULL FK → products(id) ON DELETE CASCADE`
   - `name varchar NOT NULL`
   - `description text NULL`
   - `required boolean DEFAULT false`
   - `minSelections int DEFAULT 0`
   - `maxSelections int DEFAULT 1`
   - `isActive boolean DEFAULT true`
   - `displayOrder int DEFAULT 0`
   - `createdAt`, `updatedAt`
   - `INDEX (productId)`

2. **`product_options`**
   - `id uuid PK`
   - `groupId uuid NOT NULL FK → product_option_groups(id) ON DELETE CASCADE`
   - `name varchar NOT NULL`
   - `priceModifier decimal(10,2) DEFAULT 0`
   - `isAvailable boolean DEFAULT true`
   - `displayOrder int DEFAULT 0`
   - `createdAt`, `updatedAt`
   - `INDEX (groupId)`

3. **`order_item_options`**
   - `id uuid PK`
   - `orderItemId uuid NOT NULL FK → order_items(id) ON DELETE CASCADE`
   - `optionGroupId uuid NOT NULL`
   - `optionGroupName varchar NOT NULL`
   - `optionId uuid NOT NULL`
   - `optionName varchar NOT NULL`
   - `priceModifier decimal(10,2) DEFAULT 0`
   - `INDEX (orderItemId)`

---

## Parte 4 — DTOs e Service de Option Groups

### DTOs em `src/modules/restaurant/dto/`

**`create-product-option-group.dto.ts`**:
```typescript
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsInt, IsOptional, IsString, Min,
  ValidateNested,
} from 'class-validator';

export class CreateProductOptionDto {
  @IsString() name: string;
  @IsOptional() @IsNumber() @Min(0) priceModifier?: number;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class CreateProductOptionGroupDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() @Min(0) minSelections?: number;
  @IsOptional() @IsInt() @Min(1) maxSelections?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductOptionDto)
  options?: CreateProductOptionDto[];
}
```

**`update-product-option-group.dto.ts`** — `PartialType(CreateProductOptionGroupDto)` sem o campo `options`.

**`create-product-option.dto.ts`**:
```typescript
export class CreateProductOptionDto {
  @IsString() name: string;
  @IsOptional() @IsNumber() @Min(0) priceModifier?: number;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}
```

**`update-product-option.dto.ts`** — `PartialType(CreateProductOptionDto)`.

---

### `src/modules/restaurant/product-option.service.ts`

Crie o service responsável pelo CRUD de grupos e opções:

```typescript
@Injectable()
export class ProductOptionService {
  constructor(
    @InjectRepository(ProductOptionGroup)
    private readonly groupRepo: Repository<ProductOptionGroup>,
    @InjectRepository(ProductOption)
    private readonly optionRepo: Repository<ProductOption>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async createGroup(productId: string, restaurantId: string, dto: CreateProductOptionGroupDto): Promise<ProductOptionGroup> {
    // 1. Verificar que o produto pertence ao restaurante — lançar NotFoundException/ForbiddenException conforme o caso
    // 2. Criar o grupo com os campos do DTO
    // 3. Se dto.options existir, criar as opções em cascata
    // 4. Retornar grupo salvo com relações
  }

  async findGroupsByProduct(productId: string): Promise<ProductOptionGroup[]> {
    // Retornar somente grupos com isActive = true ordenados por displayOrder
    // Incluir relation options onde isAvailable = true, ordenadas por displayOrder
  }

  async findAllGroupsByProduct(productId: string): Promise<ProductOptionGroup[]> {
    // Retornar todos os grupos (inclusive inativos) — para uso interno/admin
  }

  async updateGroup(groupId: string, restaurantId: string, dto: UpdateProductOptionGroupDto): Promise<ProductOptionGroup> {
    // 1. Buscar grupo e verificar que product.restaurantId === restaurantId
    // 2. Validar que minSelections <= maxSelections (se ambos fornecidos)
    // 3. Salvar e retornar
  }

  async deleteGroup(groupId: string, restaurantId: string): Promise<void> {
    // Verificar ownership e remover (cascade remove options)
  }

  async createOption(groupId: string, restaurantId: string, dto: CreateProductOptionDto): Promise<ProductOption> {
    // 1. Buscar grupo -> produto -> verificar restaurantId
    // 2. Criar e salvar opção
  }

  async updateOption(optionId: string, restaurantId: string, dto: UpdateProductOptionDto): Promise<ProductOption> {
    // Verificar ownership via group -> product -> restaurantId e salvar
  }

  async deleteOption(optionId: string, restaurantId: string): Promise<void> {
    // Verificar ownership e remover
  }
}
```

---

## Parte 5 — Novos endpoints no RestaurantController (ou controller dedicado)

Adicione em `src/modules/restaurant/restaurant.controller.ts` (ou crie `product-option.controller.ts`):

```
POST   /restaurants/:restaurantId/products/:productId/option-groups
       → createGroup (@Roles('restaurant_owner'), @CurrentUser() para verificar ownership)

GET    /restaurants/:restaurantId/products/:productId/option-groups
       → findGroupsByProduct (público — retorna apenas grupos e opções ativos)

PATCH  /restaurants/:restaurantId/products/:productId/option-groups/:groupId
       → updateGroup (@Roles('restaurant_owner'))

DELETE /restaurants/:restaurantId/products/:productId/option-groups/:groupId
       → deleteGroup (@Roles('restaurant_owner'))

POST   /restaurants/:restaurantId/products/:productId/option-groups/:groupId/options
       → createOption (@Roles('restaurant_owner'))

PATCH  /restaurants/:restaurantId/products/:productId/option-groups/:groupId/options/:optionId
       → updateOption (@Roles('restaurant_owner'))

DELETE /restaurants/:restaurantId/products/:productId/option-groups/:groupId/options/:optionId
       → deleteOption (@Roles('restaurant_owner'))
```

Todos os endpoints de escrita devem verificar que `@CurrentUser().restaurantId === restaurantId` do path param ou que o produto pertence ao restaurante — lançar `ForbiddenException` caso contrário.

---

## Parte 6 — Modificar Order Creation (OrderService + DTO)

### Novo DTO em `src/modules/order/dto/`

**`create-order-item-option-selection.dto.ts`**:
```typescript
import { IsUUID, IsArray, ArrayNotEmpty } from 'class-validator';

export class OptionSelectionDto {
  @IsUUID()
  groupId: string;

  /** IDs das opções escolhidas dentro do grupo */
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  optionIds: string[];
}
```

### Atualizar `CreateOrderItemDto` (em `create-order.dto.ts`)

Adicione o campo `selectedOptions` como **opcional** — pedidos de produtos sem grupos de opções continuam funcionando normalmente:

```typescript
import { IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OptionSelectionDto } from './create-order-item-option-selection.dto';

// Dentro de CreateOrderItemDto:
@IsOptional()
@IsArray()
@ValidateNested({ each: true })
@Type(() => OptionSelectionDto)
selectedOptions?: OptionSelectionDto[];
```

### Atualizar `OrderService.create()`

Após criar o `OrderItem` base, adicionar a seguinte lógica para cada item:

```typescript
async function validateAndBuildOptionSnapshots(
  item: CreateOrderItemDto,
  product: Product,  // com product.optionGroups e product.optionGroups[].options carregados
  orderItemId: string,
): Promise<OrderItemOption[]> {
  const activeGroups = product.optionGroups.filter(g => g.isActive);
  const snapshots: OrderItemOption[] = [];
  const selectionMap = new Map(
    (item.selectedOptions ?? []).map(s => [s.groupId, s.optionIds]),
  );

  for (const group of activeGroups) {
    const selectedIds = selectionMap.get(group.id) ?? [];

    // Validação 1: grupo obrigatório deve ter seleção
    if (group.required && selectedIds.length < group.minSelections) {
      throw new BadRequestException(
        `O grupo "${group.name}" requer ao menos ${group.minSelections} opção(ões) selecionada(s).`,
      );
    }

    // Validação 2: não exceder maxSelections
    if (selectedIds.length > group.maxSelections) {
      throw new BadRequestException(
        `O grupo "${group.name}" permite no máximo ${group.maxSelections} opção(ões).`,
      );
    }

    // Validação 3: cada optionId deve existir no grupo e estar disponível
    for (const optionId of selectedIds) {
      const option = group.options.find(o => o.id === optionId && o.isAvailable);
      if (!option) {
        throw new BadRequestException(
          `Opção "${optionId}" não encontrada ou indisponível no grupo "${group.name}".`,
        );
      }

      // Criar snapshot
      const snapshot = new OrderItemOption();
      snapshot.orderItemId = orderItemId;
      snapshot.optionGroupId = group.id;
      snapshot.optionGroupName = group.name;
      snapshot.optionId = option.id;
      snapshot.optionName = option.name;
      snapshot.priceModifier = Number(option.priceModifier);
      snapshots.push(snapshot);
    }
  }

  return snapshots;
}
```

**Ajustar o cálculo do `subtotal`** de cada `OrderItem` para incluir os price modifiers das opções selecionadas:

```typescript
// Dentro do loop de criação de OrderItems:
const optionsTotal = (item.selectedOptions ?? []).flatMap(s => s.optionIds).reduce((acc, optionId) => {
  // Buscar o priceModifier do option selecionado entre os grupos do produto
  const option = product.optionGroups
    .flatMap(g => g.options)
    .find(o => o.id === optionId);
  return acc + (option ? Number(option.priceModifier) : 0);
}, 0);

orderItem.subtotal = (Number(product.price) + optionsTotal) * item.quantity;
```

**Salvar os snapshots** após salvar o `OrderItem`:
```typescript
if (snapshots.length > 0) {
  await orderItemOptionRepo.save(snapshots);
}
```

**Ajustar o `totalAmount` do `Order`** para refletir o novo subtotal com opções.

**Carregar `optionGroups` e seus `options`** ao buscar produtos no `create()`:
```typescript
const products = await productRepo.find({
  where: { id: In(productIds) },
  relations: ['optionGroups', 'optionGroups.options'],
});
```

---

## Parte 7 — Resposta do GET /orders/:id

O endpoint `findOne` já carrega `items`. Certifique-se de que `items.selectedOptions` é carregado:
- Se `OrderItemOption` tiver `eager: true` na relação de `OrderItem`, isso é automático.
- Caso contrário, adicionar `'items.selectedOptions'` ao array de `relations` do `findOne`.

A resposta de um item do pedido deve incluir:
```json
{
  "id": "...",
  "productName": "Arroz e Feijão",
  "productPrice": "15.00",
  "quantity": 1,
  "subtotal": "17.00",
  "selectedOptions": [
    {
      "optionGroupId": "...",
      "optionGroupName": "Escolha o acompanhamento",
      "optionId": "...",
      "optionName": "Ambos",
      "priceModifier": "2.00"
    }
  ]
}
```

---

## Parte 8 — Registrar entidades e service no módulo

### `src/modules/restaurant/restaurant.module.ts`

Adicione ao `TypeOrmModule.forFeature([...])`:
- `ProductOptionGroup`
- `ProductOption`

Adicione `ProductOptionService` ao array `providers`.  
Exporte `ProductOptionService` caso o `OrderModule` precise.

### `src/modules/order/order.module.ts`

Adicione ao `TypeOrmModule.forFeature([...])`:
- `OrderItemOption`

---

## Parte 9 — Redis: o que usar e por quê

### Cache de grupos de opções por produto

O `GET /option-groups` é **público e lido com alta frequência** — toda vez que um cliente abre a tela de um produto, esse endpoint é chamado. O DB não deve ser consultado em cada request.

**Chave:** `product:{productId}:option-groups`  
**TTL:** 300 segundos  
**Tipo:** JSON serializado (`cacheGet` / `cacheSet` do `RedisService`)

#### Em `ProductOptionService.findGroupsByProduct()`

```typescript
async findGroupsByProduct(productId: string): Promise<ProductOptionGroup[]> {
  const cacheKey = `product:${productId}:option-groups`;
  const cached = await this.redisService.cacheGet<ProductOptionGroup[]>(cacheKey);
  if (cached) return cached;

  const groups = await this.groupRepo.find({
    where: { productId, isActive: true },
    relations: ['options'],
    order: { displayOrder: 'ASC' },
  });

  // Filtrar opções indisponíveis e ordenar antes de cachear
  const filtered = groups.map(g => ({
    ...g,
    options: g.options
      .filter(o => o.isAvailable)
      .sort((a, b) => a.displayOrder - b.displayOrder),
  }));

  await this.redisService.cacheSet(cacheKey, filtered, 300);
  return filtered as ProductOptionGroup[];
}
```

#### Invalidação do cache

Chamar `redisService.cacheDel(\`product:${productId}:option-groups\`)` em **todos** os métodos de escrita do `ProductOptionService`:

| Método | Quando invalidar |
|---|---|
| `createGroup(productId, ...)` | após salvar o grupo |
| `updateGroup(groupId, ...)` | após salvar — buscar `productId` via `group.productId` |
| `deleteGroup(groupId, ...)` | após remover — buscar `productId` antes de deletar |
| `createOption(groupId, ...)` | após salvar — buscar `productId` via `group.productId` |
| `updateOption(optionId, ...)` | após salvar — buscar `productId` via `option.group.productId` |
| `deleteOption(optionId, ...)` | após remover — buscar `productId` antes de deletar |

#### Rate limit em endpoints admin de escrita

Aplicar `@RateLimit(30, 60)` (30 writes/min) nos endpoints `POST`, `PATCH` e `DELETE` do `ProductOptionController` para evitar abuso por parte de administradores mal-intencionados ou scripts.

### O que NÃO usar

| Redis feature | Justificativa |
|---|---|
| ❌ GEO | Não há coordenadas geográficas nessa feature |
| ❌ Lock distribuído | Operações de escrita são simples CRUD sem concorrência crítica |
| ❌ Presença/driver state | Fora do escopo desta etapa |
| ❌ Cache do `findAllGroupsByProduct` (admin) | Endpoint admin é pouco frequente — não vale a complexidade de cache |
| ❌ Cache de `OrderItemOption` | São dados imutáveis já no DB, carregados com `eager: true` |

---

## Parte 10 — Regras de negócio críticas

1. **Snapshot é imutável** — nunca atualizar `order_item_options` após a criação do pedido.
2. **Grupos inativos são ignorados** — `isActive = false` torna o grupo invisível ao cliente e na validação do pedido.
3. **Opções indisponíveis são rejeitadas** — `isAvailable = false` nas opções deve retornar `BadRequestException`.
4. **Produto sem grupos** — pedido funciona normalmente sem `selectedOptions`.
5. **Group sem opções disponíveis + required = true** — o restaurante é responsável por não ativar grupos sem opções. O sistema deve lançar `BadRequestException` clara se isso ocorrer.
6. **priceModifier nunca negativo** — validar na camada de DTO (`@Min(0)`).
7. **Ordem de exibição** — sempre ordenar grupos e opções por `displayOrder ASC` nas respostas públicas.
8. **Exclusão em cascata** — deletar um grupo apaga suas opções; deletar um produto apaga seus grupos (ON DELETE CASCADE na FK).
9. **Validar minSelections <= maxSelections** ao criar ou atualizar grupo.
10. **Sempre invalidar cache** ao criar, atualizar ou deletar grupo ou opção.

---

## Parte 11 — Fluxo de commit e PR

```bash
git checkout main && git pull origin main
git checkout -b feat/e5b-order-options

# Adicionar novos arquivos
git add src/modules/restaurant/entities/product-option-group.entity.ts
git add src/modules/restaurant/entities/product-option.entity.ts
git add src/modules/order/entities/order-item-option.entity.ts
git add src/modules/restaurant/dto/create-product-option-group.dto.ts
git add src/modules/restaurant/dto/update-product-option-group.dto.ts
git add src/modules/restaurant/dto/create-product-option.dto.ts
git add src/modules/restaurant/dto/update-product-option.dto.ts
git add src/modules/order/dto/create-order-item-option-selection.dto.ts
git add src/modules/restaurant/product-option.service.ts

# Arquivos modificados
git add src/modules/restaurant/entities/product.entity.ts
git add src/modules/order/entities/order-item.entity.ts
git add src/modules/order/order.service.ts
git add src/modules/order/dto/create-order.dto.ts
git add src/modules/restaurant/restaurant.module.ts
git add src/modules/order/order.module.ts
git add src/modules/restaurant/restaurant.controller.ts
git add src/database/migrations/

git commit -m "feat: add product option groups and order item options with snapshot"
git push origin feat/e5b-order-options

gh pr create \
  --title "feat: E5B - Product option groups and order options" \
  --base main \
  --body "## O que foi feito
- Entidades \`ProductOptionGroup\`, \`ProductOption\`, \`OrderItemOption\`
- CRUD de grupos e opções via admin do restaurante
- Cache Redis de grupos por produto (product:{id}:option-groups TTL 300s)
- Invalidação de cache em todas as operações de escrita
- Rate limit nos endpoints admin de escrita (30 req/min)
- Validação de seleções obrigatórias, mínimo e máximo por grupo
- Snapshot imutável de opções no momento do pedido
- Subtotal ajustado com priceModifier das opções selecionadas

## Depende de
PRs E3, E5 e E7 mergeados

## Regras de negócio
- Snapshot preserva nome e preço das opções no momento do pedido
- Grupos inativos não aparecem e não são validados
- Opções indisponíveis rejeitadas com 400
- Produtos sem grupos de opções continuam funcionando normalmente
- Cache é invalidado em qualquer escrita de grupo ou opção"
```
