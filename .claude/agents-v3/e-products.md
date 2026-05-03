---
name: e-products
description: Produtos avançados — rating individual, tempo de preparo, origem culinária, produtos em destaque. Depende de E3, E5 e E-Storage.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Produtos Avançados.

## Pré-requisito
PRs E3, E5 e E-Storage mergeados.

---

## Novos campos em `product.entity.ts`

- preparationMinutes: int, default 10
- averageRating: decimal(3,2), default 0
- totalRatings: int, default 0
- cuisineOrigin: varchar nullable — ex: 'Japonesa', 'Italiana', 'Brasileira'
- isFeatured: boolean, default false
- calories: int nullable

---

## Entidade `ProductRating`

- id: uuid PK
- productId (@Index, FK → products ON DELETE CASCADE)
- customerId (@Index, FK → users)
- orderItemId: uuid FK → order_items
- rating: smallint 1–5
- comment: text nullable
- createdAt
- @Unique(['customerId', 'orderItemId'])

---

## DTOs

**create-product-rating.dto.ts**: orderItemId (UUID), rating (int 1–5), comment (string, opcional)

**update-product.dto.ts** — estender com: preparationMinutes (int 0–300), cuisineOrigin (string), isFeatured (boolean), calories (int ≥0)

---

## ProductService (métodos novos)

**findProductWithDeliveryTime(productId)**
1. Buscar produto com relations `['restaurant', 'optionGroups', 'optionGroups.options']`
2. `totalMinutes = product.preparationMinutes + product.restaurant.estimatedDeliveryMinutes`
3. Retornar `{ ...product, totalMinutes }`; cache `product:{id}:detail` TTL 300s

**rateProduct(productId, customerId, dto)**
1. Buscar orderItem com relations `['order']` — verificar `order.customerId === customerId` e `order.status === DELIVERED`
2. Verificar que não existe rating para `(customerId, orderItemId)` → ConflictException
3. Criar e salvar ProductRating
4. Recalcular `averageRating` e `totalRatings` via subquery SQL (como em restaurant review)
5. Invalidar cache `product:{productId}:detail`

**findProductRatings(productId, dto)**: paginado, relations `['customer']`, ORDER BY createdAt DESC

**findFeaturedProducts(restaurantId)**: `WHERE restaurantId=x AND isAvailable=true AND isFeatured=true ORDER BY averageRating DESC`

**findByCuisineOrigin(origin, page, limit)**: `WHERE cuisineOrigin=x AND isAvailable=true`, relations `['restaurant']`

---

## Endpoints (adicionar ao controller)

```
GET  /restaurants/:restaurantId/products/featured             → findFeaturedProducts (público)
GET  /restaurants/:restaurantId/products/:productId/detail    → findProductWithDeliveryTime (público)
POST /restaurants/:restaurantId/products/:productId/ratings   → rateProduct (@Roles('customer'))
GET  /restaurants/:restaurantId/products/:productId/ratings   → findProductRatings (público)
GET  /products/cuisine/:origin                                 → findByCuisineOrigin (público)
```

## Migration
```bash
npm run migration:generate -- src/database/migrations/AddProductAdvanced
npm run migration:run
```

## Commit
```bash
git checkout -b feat/e-products-advanced
git add src/modules/restaurant
git commit -m "feat: add product ratings, preparation time, cuisine origin and featured products"
```

## Regras
- Rating só permitido após pedido `DELIVERED`
- Um rating por customer por orderItem (@Unique)
- `averageRating` recalculado via SQL (nunca em memória)
- `totalMinutes` nunca armazenado — sempre calculado em runtime
- Cache `product:{id}:detail` invalidado em qualquer update do produto
