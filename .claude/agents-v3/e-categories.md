---
name: e-categories
description: Categorias e Tags — sistema de tags para restaurantes e produtos (Popular, Fast Delivery, High Class, Dine In, Pick Up, Nearest). Gerenciadas por admin. Depende de E3 e E-Products.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Categorias e Tags.

## Pré-requisito
PRs E3 e E-Products mergeados.

---

## Entidades (`src/modules/category/entities/`)

### `tag.entity.ts`
- id: uuid PK
- name: varchar unique — ex: 'Popular', 'Fast Delivery'
- slug: varchar unique — ex: 'popular', 'fast_delivery'
- icon: varchar nullable, color: varchar nullable (#hex)
- scope: enum `restaurant|product|both`, default `restaurant`
- isActive: boolean default true
- displayOrder: int default 0
- isAutomatic: boolean default false — se true, atribuída por algoritmo, não manualmente
- createdAt, updatedAt

### `restaurant-tag.entity.ts`
Chave composta: `restaurantId (PrimaryColumn)` + `tagId (PrimaryColumn)`.
- assignedAt: createdAt
- @Index('IDX_restaurant_tag_restaurant', ['restaurantId'])
- @Index('IDX_restaurant_tag_tag', ['tagId'])
- Relacionamentos: restaurant (ManyToOne ON DELETE CASCADE), tag (ManyToOne ON DELETE CASCADE)

### `product-tag.entity.ts`
Chave composta: `productId (PrimaryColumn)` + `tagId (PrimaryColumn)`.
- assignedAt: createdAt
- @Index(['productId']), @Index(['tagId'])
- Relacionamentos: product (ManyToOne ON DELETE CASCADE), tag (ManyToOne ON DELETE CASCADE)

---

## Tags padrão (seed)

Criar `src/database/seeds/tags.seed.ts` com as tags default e rodar na inicialização (ou comando `npm run seed`):

| name | slug | scope | isAutomatic | icon | color |
|---|---|---|---|---|---|
| Popular | popular | restaurant | true | 🔥 | #FF5733 |
| Fast Delivery | fast_delivery | restaurant | true | ⚡ | #FFC300 |
| High Class | high_class | restaurant | false | ⭐ | #8B0000 |
| Dine In | dine_in | restaurant | false | 🍽️ | #2ECC71 |
| Pick Up | pick_up | restaurant | false | 🛍️ | #3498DB |
| Nearest | nearest | restaurant | true | 📍 | #9B59B6 |
| Popular | popular | product | true | 🔥 | #FF5733 |
| Recommended | recommended | product | false | 👍 | #27AE60 |
| Vegan | vegan | product | false | 🌿 | #2ECC71 |
| Spicy | spicy | product | false | 🌶️ | #E74C3C |

---

## CategoryModule (`src/modules/category/`)

Importa `TypeOrmModule.forFeature([Tag, RestaurantTag, ProductTag])`.

### TagService — métodos

- `findAll(scope?)`: retorna tags ativas, filtradas por scope, order por `displayOrder`; cache `tags:all` TTL 3600s
- `findOne(id)`: NotFoundException se não existe
- `create(dto)`: apenas admin; gerar slug a partir do name se não fornecido
- `update(id, dto)`: invalidar cache `tags:all`
- `remove(id)`: invalidar cache

### RestaurantTagService — métodos

- `assignTag(restaurantId, tagId)`: verificar que tag tem scope `restaurant|both`; criar RestaurantTag
- `removeTag(restaurantId, tagId)`: deletar RestaurantTag
- `findByRestaurant(restaurantId)`: retorna tags ativas do restaurante
- `findByTag(tagId, page, limit)`: restaurantes com aquela tag, paginado
- `updateAutoTags()`: método chamado por cron ou manualmente para recalcular tags automáticas:
  - `popular`: restaurantes com mais pedidos no últimos 7 dias
  - `fast_delivery`: `estimatedDeliveryMinutes <= 30`
  - `nearest`: não atribuído automaticamente (é filtro de busca, não tag persistida)

### ProductTagService — mesmos padrões do RestaurantTagService, para produtos.

---

## DTOs

- **create-tag.dto.ts**: name, slug? (auto-gerado se omitido), icon?, color?, scope, isAutomatic?, displayOrder?
- **update-tag.dto.ts**: PartialType
- **assign-tag.dto.ts**: tagId (UUID)

---

## Endpoints

```
POST   /tags                          → create (@Roles('admin'))
GET    /tags?scope=restaurant         → findAll (público, cache 1h)
GET    /tags/:id                      → findOne (público)
PATCH  /tags/:id                      → update (@Roles('admin'))
DELETE /tags/:id                      → remove (@Roles('admin'))

POST   /restaurants/:id/tags          → assignTag (@Roles('admin'))
DELETE /restaurants/:id/tags/:tagId   → removeTag (@Roles('admin'))
GET    /restaurants/:id/tags          → findByRestaurant (público)
GET    /tags/:tagId/restaurants       → findByTag (público)

POST   /products/:id/tags             → assignTag (@Roles('admin'))
DELETE /products/:id/tags/:tagId      → removeTag (@Roles('admin'))
GET    /products/:id/tags             → findByProduct (público)
```

## Migration
```bash
npm run migration:generate -- src/database/migrations/AddCategoryTags
npm run migration:run
```

## Commit
```bash
git checkout -b feat/e-categories
git add src/modules/category src/database/seeds/tags.seed.ts
git commit -m "feat: add category tags system for restaurants and products"
```

## Regras
- Tags automáticas não podem ser atribuídas manualmente pelo admin
- Cache `tags:all` invalidado em qualquer escrita de tag
- Slug único — gerado a partir do name em lowercase com underscore
