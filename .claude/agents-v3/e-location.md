---
name: e-location
description: Localização — endereços estruturados (rua, cidade, estado, CEP, lat/lng) para restaurantes e usuários, com geocodificação via Redis e múltiplos endereços por usuário. Depende de E2 e E7.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Localização e Endereços.

## Pré-requisito
PRs E2 e E7 mergeados. Entidades `User` e `Restaurant` já existem com `address` (varchar) e `latitude/longitude`.

---

## Entidade `Address` (`src/modules/location/entities/address.entity.ts`)

- id: uuid PK
- userId: uuid nullable, @Index — um dos dois obrigatório
- restaurantId: uuid nullable, @Index
- street: varchar — logradouro
- number: varchar nullable
- complement: varchar nullable
- neighborhood: varchar nullable
- city: varchar, state: varchar, country: varchar(2) default 'BR'
- zipCode: varchar nullable
- latitude: decimal(10,7) nullable, longitude: decimal(10,7) nullable
- type: enum `home|work|other|restaurant|pickup`, default `other`
- isPrimary: boolean default false — endereço principal
- label: varchar nullable — ex: 'Casa', 'Trabalho'
- createdAt, updatedAt
- Relacionamentos: user (ManyToOne → User, ON DELETE CASCADE), restaurant (ManyToOne → Restaurant, ON DELETE CASCADE)

**Invariante**: pelo menos um de `userId` ou `restaurantId` deve ser não-nulo; nunca ambos.

---

## Módulo (`src/modules/location/`)

Importa `TypeOrmModule.forFeature([Address])`. Exporta `LocationService`, `GeocodingService`.

---

## DTOs

**create-address.dto.ts**: street, number?, complement?, neighborhood?, city, state, country? (default 'BR'), zipCode?, latitude?, longitude?, type?, isPrimary? (boolean), label?

**update-address.dto.ts**: PartialType

**geocode-request.dto.ts**: address (string) — endereço livre para geocodificar

---

## LocationService — métodos

**createForUser(userId, dto)**
1. Se `dto.isPrimary=true`: desmarcar outros endereços do user
2. Criar Address com `userId`

**createForRestaurant(restaurantId, dto)**
1. Mesmo padrão de isPrimary
2. Criar Address com `restaurantId`

**findByUser(userId)**: retorna todos os endereços, primary primeiro

**findByRestaurant(restaurantId)**: retorna todos os endereços, primary primeiro

**update(id, userId|restaurantId, dto)**
1. Verificar ownership — ForbiddenException
2. Se isPrimary: desmarcar outros
3. Atualizar

**remove(id, userId|restaurantId)**: verificar ownership; não remover se for o único endereço

**setPrimary(id, userId|restaurantId)**: desmarcar todos os outros; marcar este

---

## GeocodingService — métodos

Usa cache Redis: chave `geocode:{base64(address)}` TTL 86400s (1 dia).

**geocode(address: string): Promise<{ lat: number; lng: number } | null>**
1. Verificar cache Redis
2. Se miss: chamar API externa (Nominatim OpenStreetMap gratuito, ou Google Maps API)
3. Cachear resultado
4. Retornar `{ lat, lng }` ou null se não encontrado

**reverseGeocode(lat, lng): Promise<string | null>**
- Chave: `geocode:reverse:{lat},{lng}`
- Retornar endereço formatado

> Usar `axios` ou `fetch` para as chamadas. **Nunca logar as respostas completas** (podem conter dados de usuário).

---

## Endpoints

```
POST   /users/me/addresses           → createForUser (@CurrentUser)
GET    /users/me/addresses           → findByUser (@CurrentUser)
PATCH  /users/me/addresses/:id       → update (@CurrentUser)
DELETE /users/me/addresses/:id       → remove (@CurrentUser)
PATCH  /users/me/addresses/:id/primary → setPrimary (@CurrentUser)

POST   /restaurants/:id/addresses    → createForRestaurant (@Roles('restaurant_owner'))
GET    /restaurants/:id/addresses    → findByRestaurant (público)
PATCH  /restaurants/:id/addresses/:addressId  → update (@Roles('restaurant_owner'))
DELETE /restaurants/:id/addresses/:addressId  → remove (@Roles('restaurant_owner'))

POST   /geocode                      → geocode (autenticado)
POST   /reverse-geocode              → reverseGeocode (autenticado)
```

## Variáveis de ambiente
```
GEOCODING_PROVIDER=nominatim|google
GOOGLE_MAPS_API_KEY=...  # se provider=google
```

## Migration
```bash
npm run migration:generate -- src/database/migrations/AddAddresses
npm run migration:run
```

## Commit
```bash
git checkout -b feat/e-location
git add src/modules/location
git commit -m "feat: add structured address module with geocoding cache"
```

## Regras
- Nunca ambos `userId` e `restaurantId` no mesmo registro
- `isPrimary=true` → desmarcar todos os outros do mesmo owner (query de update)
- Cache de geocodificação TTL 1 dia — endereços não mudam com frequência
- Tolerância a falhas: retornar null se geocodificação falhar, não 500
