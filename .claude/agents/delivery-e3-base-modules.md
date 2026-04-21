---
name: delivery-e3-base-modules
description: Etapa 3 do sistema de delivery — cria os módulos base (RestaurantModule, UserModule, DriverModule) com CRUD simples sem autenticação. Depende da Etapa 2 (entidades criadas). Use após o PR da E2 ser mergeado.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 3 — Módulos Base (CRUD sem regra de negócio)** do sistema de delivery.

## Pré-requisito
PRs das Etapas 1 e 2 mergeados na `main`.

## O que você deve criar

### RestaurantModule (`src/modules/restaurant/`)

**restaurant.module.ts** — importa TypeOrmModule com Restaurant e Product entities.

**DTOs:**
- `create-restaurant.dto.ts`: name, description, address, latitude, longitude (com validações `class-validator`)
- `update-restaurant.dto.ts`: PartialType de CreateRestaurantDto
- `create-product.dto.ts`: restaurantId, name, description, price, imageUrl
- `update-product.dto.ts`: PartialType de CreateProductDto

**restaurant.service.ts:**
- `create(dto)` — cria restaurante
- `findAll(page, limit)` — lista com paginação
- `findOne(id)` — busca por id, lança `NotFoundException` se não encontrar
- `update(id, dto)` — atualiza
- `remove(id)` — soft delete ou delete
- `createProduct(dto)` — cria produto para um restaurante
- `findProducts(restaurantId)` — lista produtos disponíveis

**restaurant.controller.ts:**
- `POST /restaurants`
- `GET /restaurants?page=1&limit=10`
- `GET /restaurants/:id`
- `PATCH /restaurants/:id`
- `DELETE /restaurants/:id`
- `POST /restaurants/:id/products`
- `GET /restaurants/:id/products`

---

### UserModule (`src/modules/user/`)

**user.module.ts**

**DTOs:**
- `create-user.dto.ts`: name, email, password, phone, role
- `update-user.dto.ts`: PartialType (sem password)

**user.service.ts:**
- `create(dto)` — cria usuário (hash de password com bcrypt)
- `findOne(id)` — busca por id
- `findByEmail(email)` — usado pelo AuthModule futuramente
- `update(id, dto)` — atualiza
- `remove(id)` — deleta

**user.controller.ts:**
- `GET /users/:id`
- `PATCH /users/:id`
- `DELETE /users/:id`
- (POST será pelo AuthModule na E4)

---

### DriverModule (`src/modules/driver/`)

**driver.module.ts**

**DTOs:**
- `create-driver.dto.ts`: userId, vehicleType, licensePlate
- `update-driver.dto.ts`: PartialType + isAvailable, currentLatitude, currentLongitude

**driver.service.ts:**
- `create(dto)` — cria perfil de entregador
- `findOne(id)` — busca por id
- `findByUserId(userId)` — busca pelo userId
- `update(id, dto)` — atualiza
- `updateLocation(id, lat, lng)` — atualiza posição atual
- `setAvailability(id, available)` — liga/desliga disponibilidade

**driver.controller.ts:**
- `POST /drivers`
- `GET /drivers/:id`
- `PATCH /drivers/:id`
- `PATCH /drivers/:id/location`
- `PATCH /drivers/:id/availability`

---

### Common — Paginação
`src/common/dto/pagination.dto.ts`:
```typescript
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
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

### Instalar bcrypt
```bash
npm install bcrypt
npm install -D @types/bcrypt
```

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e3-base-modules`
3. Criar todos os arquivos
4. `git add src/modules/restaurant src/modules/user src/modules/driver src/common`
5. `git commit -m "feat: add base CRUD modules for restaurant, user and driver"`
6. `git push origin feat/e3-base-modules`
7. `gh pr create --title "feat: E3 - Base CRUD modules" --base main --body "## O que foi feito\n- RestaurantModule com CRUD de restaurantes e produtos\n- UserModule com criação e gestão de usuários\n- DriverModule com localização e disponibilidade\n- PaginationDto reutilizável\n\n## Depende de\nPR E2 mergeado\n\n## Endpoints criados\n- POST/GET/PATCH/DELETE /restaurants\n- GET/PATCH/DELETE /users/:id\n- POST/GET/PATCH /drivers"`

## Regras
- Endpoints abertos (sem guards) — auth será adicionado na E4
- Nunca retornar passwordHash nas respostas — usar `Exclude()` do class-transformer ou selecionar campos no service
- Lançar `NotFoundException` quando recurso não encontrado
- Não implementar lógica de pedidos ou pagamentos
