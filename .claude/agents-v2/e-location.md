---
name: e-location
description: Agente de Localização — endereços estruturados (rua, cidade, estado, país, CEP) para restaurantes e usuários, com geocodificação opcional, suporte a múltiplos endereços por usuário, integração com Haversine e Redis GEO. Depende das E2 e E7.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pelo módulo de **Localização e Endereços**.

## Pré-requisito
PRs das E2 e E7 mergeados na `main`. Entidades `User` e `Restaurant` já existem.

---

## Visão geral

Atualmente `Restaurant` tem apenas `address` (varchar) e `latitude/longitude`. `User` e `Order` têm `deliveryAddress` (varchar). Este agente adiciona endereços estruturados com todos os campos geográficos necessários, mantendo compatibilidade retroativa com os campos existentes.

---

## Parte 1 — Entidade `Address`

`src/modules/location/entities/address.entity.ts`:

```typescript
import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export enum AddressType {
  HOME = 'home',
  WORK = 'work',
  OTHER = 'other',
  RESTAURANT = 'restaurant',
  PICKUP = 'pickup',
}

@Entity('addresses')
@Index('IDX_address_user', ['userId'])
@Index('IDX_address_restaurant', ['restaurantId'])
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // ── Dono do endereço (um dos dois obrigatório) ───────────────────────────

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  restaurantId!: string | null;

  // ── Campos estruturados ──────────────────────────────────────────────────

  /** Logradouro: Rua, Avenida, etc. */
  @Column({ type: 'varchar' })
  street!: string;

  /** Número (pode ser 'S/N') */
  @Column({ type: 'varchar', nullable: true })
  number!: string | null;

  /** Complemento: Apto, Sala, Bloco */
  @Column({ type: 'varchar', nullable: true })
  complement!: string | null;

  /** Bairro / Neighborhood */
  @Column({ type: 'varchar', nullable: true })
  neighborhood!: string | null;

  @Column({ type: 'varchar' })
  city!: string;

  /** Estado / Province (2 letras: SP, RJ, etc. ou nome completo) */
  @Column({ type: 'varchar' })
  state!: string;

  /** ISO 3166-1 alpha-2 country code: BR, US, PT */
  @Column({ type: 'varchar', length: 2, default: 'BR' })
  country!: string;

  /** CEP/ZIP Code */
  @Column({ type: 'varchar', nullable: true })
  zipCode!: string | null;

  // ── Coordenadas ──────────────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: number | null;

  // ── Metadados ────────────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: AddressType, default: AddressType.OTHER })
  type!: AddressType;

  /** Endereço principal deste usuário/restaurante */
  @Column({ type: 'boolean', default: false })
  isPrimary!: boolean;

  /** Label amigável: 'Casa', 'Escritório', 'Casa da mãe' */
  @Column({ type: 'varchar', nullable: true })
  label!: string | null;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;

  @ManyToOne('User', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: any;

  @ManyToOne('Restaurant', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurantId' })
  restaurant!: any;
}
```

**Constraint importante:** um endereço deve ter `userId` OU `restaurantId`, nunca ambos e nunca nenhum. Implementar via `check constraint` na migration:
```sql
ALTER TABLE addresses ADD CONSTRAINT CHK_address_owner
  CHECK (("userId" IS NOT NULL) <> ("restaurantId" IS NOT NULL));
```

---

## Parte 2 — DTOs

`src/modules/location/dto/create-address.dto.ts`:
```typescript
export class CreateAddressDto {
  @IsString() @MinLength(3) street: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() complement?: string;
  @IsOptional() @IsString() neighborhood?: string;
  @IsString() @MinLength(2) city: string;
  @IsString() @MinLength(2) state: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string = 'BR';
  @IsOptional() @IsString() zipCode?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsEnum(AddressType) type?: AddressType = AddressType.OTHER;
  @IsOptional() @IsBoolean() isPrimary?: boolean = false;
  @IsOptional() @IsString() label?: string;
}
```

`update-address.dto.ts` — PartialType de CreateAddressDto.

`geocode-address.dto.ts`:
```typescript
export class GeocodeAddressDto {
  @IsString() street: string;
  @IsString() city: string;
  @IsString() state: string;
  @IsOptional() @IsString() country?: string = 'BR';
  @IsOptional() @IsString() zipCode?: string;
}
```

---

## Parte 3 — LocationService (`src/modules/location/location.service.ts`)

```typescript
@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Address) private addressRepo: Repository<Address>,
    private readonly redisService: RedisService,
  ) {}

  // ── Endereços de usuário ─────────────────────────────────────────────────

  async createUserAddress(userId: string, dto: CreateAddressDto): Promise<Address> {
    if (dto.isPrimary) {
      await this.addressRepo.update({ userId }, { isPrimary: false });
    }
    const address = this.addressRepo.create({ ...dto, userId, restaurantId: null });
    return this.addressRepo.save(address);
  }

  async findUserAddresses(userId: string): Promise<Address[]> {
    return this.addressRepo.find({
      where: { userId },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  async getPrimaryAddress(userId: string): Promise<Address | null> {
    return this.addressRepo.findOne({ where: { userId, isPrimary: true } });
  }

  async updateAddress(id: string, userId: string, dto: UpdateAddressDto): Promise<Address> {
    const address = await this.addressRepo.findOne({ where: { id, userId } });
    if (!address) throw new NotFoundException('Address not found');
    if (dto.isPrimary) {
      await this.addressRepo.update({ userId }, { isPrimary: false });
    }
    return this.addressRepo.save({ ...address, ...dto });
  }

  async removeAddress(id: string, userId: string): Promise<void> {
    const address = await this.addressRepo.findOne({ where: { id, userId } });
    if (!address) throw new NotFoundException('Address not found');
    await this.addressRepo.remove(address);
  }

  async setPrimaryAddress(id: string, userId: string): Promise<Address> {
    await this.addressRepo.update({ userId }, { isPrimary: false });
    const address = await this.addressRepo.findOne({ where: { id, userId } });
    if (!address) throw new NotFoundException('Address not found');
    address.isPrimary = true;
    return this.addressRepo.save(address);
  }

  // ── Endereços de restaurante ─────────────────────────────────────────────

  async createRestaurantAddress(restaurantId: string, ownerId: string, dto: CreateAddressDto): Promise<Address> {
    // Verificar ownership (opcional: passar RestaurantService via forwardRef)
    if (dto.isPrimary) {
      await this.addressRepo.update({ restaurantId }, { isPrimary: false });
    }
    const address = this.addressRepo.create({ ...dto, restaurantId, userId: null });
    return this.addressRepo.save(address);
  }

  async findRestaurantAddresses(restaurantId: string): Promise<Address[]> {
    return this.addressRepo.find({
      where: { restaurantId },
      order: { isPrimary: 'DESC' },
    });
  }

  // ── Geocodificação ────────────────────────────────────────────────────────

  /**
   * Geocodifica um endereço para lat/lng usando a API de Geocodificação.
   * Por padrão usa Nominatim (OpenStreetMap) que é gratuita.
   * Para produção, substituir por Google Maps Geocoding API ou similar.
   */
  async geocodeAddress(dto: GeocodeAddressDto): Promise<{ latitude: number; longitude: number } | null> {
    const query = [dto.street, dto.city, dto.state, dto.country].filter(Boolean).join(', ');
    const cacheKey = `geocode:${Buffer.from(query).toString('base64')}`;

    const cached = await this.redisService.cacheGet<{ latitude: number; longitude: number }>(cacheKey);
    if (cached) return cached;

    // Nominatim (OpenStreetMap) — gratuito, rate limit 1 req/s
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'delivery-api/1.0' },
      });
      const data = await response.json() as Array<{ lat: string; lon: string }>;
      if (!data.length) return null;

      const result = { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
      await this.redisService.cacheSet(cacheKey, result, 86_400); // cache 24h
      return result;
    } catch {
      return null;
    }
  }

  // ── Busca por cidade/estado ──────────────────────────────────────────────

  async findRestaurantsByCity(city: string, state?: string): Promise<Address[]> {
    const qb = this.addressRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.restaurant', 'r')
      .where('LOWER(a.city) = LOWER(:city)', { city })
      .andWhere('a.restaurantId IS NOT NULL');
    if (state) qb.andWhere('LOWER(a.state) = LOWER(:state)', { state });
    return qb.getMany();
  }
}
```

---

## Parte 4 — LocationController (`src/modules/location/location.controller.ts`)

```
# Endereços do usuário logado
GET    /users/me/addresses              → findUserAddresses (@Roles('customer', 'driver'))
POST   /users/me/addresses              → createUserAddress (@Roles('customer', 'driver'))
PATCH  /users/me/addresses/:id          → updateAddress (@Roles('customer', 'driver'))
DELETE /users/me/addresses/:id          → removeAddress (@Roles('customer', 'driver'))
PATCH  /users/me/addresses/:id/primary  → setPrimaryAddress (@Roles('customer', 'driver'))

# Endereços de restaurante
GET    /restaurants/:id/addresses        → findRestaurantAddresses (público)
POST   /restaurants/:id/addresses        → createRestaurantAddress (@Roles('restaurant_owner'))

# Geocodificação
POST   /location/geocode                 → geocodeAddress (autenticado)

# Busca geográfica
GET    /location/restaurants?city=&state= → findRestaurantsByCity (público)
```

---

## Parte 5 — LocationModule

`src/modules/location/location.module.ts`:
```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Address])],
  providers: [LocationService],
  controllers: [LocationController],
  exports: [LocationService],
})
export class LocationModule {}
```

Importar `LocationModule` no `AppModule`.

---

## Parte 6 — Atualizar entidades existentes

### Restaurant (compatibilidade retroativa)
O `Restaurant` já tem `latitude`, `longitude` e `address` (varchar). Adicionar relação:
```typescript
@OneToMany('Address', 'restaurant', { cascade: true })
addresses!: any[];
```

O campo `address` (varchar) é mantido como string formatada para exibição rápida — o campo `addresses` é a versão estruturada.

### User
Adicionar relação:
```typescript
@OneToMany('Address', 'user', { cascade: true })
addresses!: any[];
```

### Order
O `Order.deliveryAddress` (varchar) é mantido. Para novos pedidos, adicionar:
```typescript
@Column({ type: 'uuid', nullable: true })
deliveryAddressId!: string | null;

@ManyToOne('Address', { nullable: true })
@JoinColumn({ name: 'deliveryAddressId' })
deliveryAddressRef!: any;
```
Isso permite referenciar um endereço salvo do usuário ao criar o pedido.

---

## Parte 7 — Atualizar CreateOrderDto

Adicionar campo opcional `deliveryAddressId` (UUID). Se fornecido, preencher `deliveryAddress`, `deliveryLatitude` e `deliveryLongitude` automaticamente a partir do Address.

```typescript
@IsOptional() @IsUUID()
deliveryAddressId?: string;
// Se fornecido, preenche deliveryAddress/Lat/Lng automaticamente
// Se não fornecido, usar os campos manuais existentes
```

---

## Parte 8 — Migration

```bash
npm run migration:generate -- src/database/migrations/AddAddressesTable
npm run migration:run
```

Migration deve:
- Criar tabela `addresses` com todos os campos
- Adicionar constraint `CHK_address_owner`
- Adicionar `deliveryAddressId` como FK nullable em `orders`
- Criar índices em `userId`, `restaurantId`, `city`, `state`

---

## Parte 9 — Variáveis de ambiente (opcional)

Se usar Google Maps Geocoding API em produção:
```
GEOCODING_PROVIDER=google   # ou nominatim (padrão)
GOOGLE_MAPS_API_KEY=
```

---

## Fluxo de commit e PR

```bash
git checkout main && git pull origin main
git checkout -b feat/location-addresses
git add src/modules/location src/database/migrations/AddAddressesTable*
git commit -m "feat: add structured addresses with geocoding for users and restaurants"
git push origin feat/location-addresses
gh pr create \
  --title "feat: Location - structured addresses and geocoding" \
  --base main \
  --body "## O que foi feito
- Entidade Address com rua, número, complemento, bairro, cidade, estado, país, CEP, lat/lng
- AddressType: home, work, other, restaurant, pickup
- isPrimary: endereço principal por usuário/restaurante
- CRUD de endereços para usuários e restaurantes
- Geocodificação via Nominatim (OpenStreetMap) com cache Redis 24h
- CreateOrderDto aceita deliveryAddressId para referenciar endereço salvo
- Busca de restaurantes por cidade/estado
- Compatibilidade retroativa: campos existentes address/deliveryAddress preservados

## Depende de
PRs E2 e E7 mergeados

## Nota sobre geocodificação
Nominatim é gratuito mas tem rate limit de 1 req/s. Para produção com volume alto, usar Google Maps API.

## Endpoints
- GET /api/v1/users/me/addresses
- POST /api/v1/users/me/addresses
- PATCH /api/v1/users/me/addresses/:id/primary
- POST /api/v1/location/geocode
- GET /api/v1/location/restaurants?city=São Paulo&state=SP"
```

## Regras
- Um `Address` tem `userId` XOR `restaurantId` — constraint no banco
- `isPrimary = true` em no máximo um endereço por usuário/restaurante — ao setar um como primário, desativar os outros
- Geocodificação cached 24h no Redis — Nominatim tem rate limit, não chamar em cada request
- Campos `address`, `deliveryAddress` (varchar) mantidos para compatibilidade — não remover
- `country` sempre em ISO 3166-1 alpha-2 (2 letras): BR, US, PT, etc.
