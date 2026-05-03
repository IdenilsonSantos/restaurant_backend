---
name: e8-delivery
description: Etapa 8 — implementa DeliveryModule e o algoritmo de matching de entregadores usando Redis GEO, score por distância e rating, e lock distribuído. Depende das E5 e E7.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 8 — Delivery Module + Matching**.

## Pré-requisito
PRs das E5 e E7 mergeados na `main`.

## O que você deve criar

### DeliveryModule (`src/modules/delivery/`)

**delivery.module.ts** — importa:
- `TypeOrmModule.forFeature([Delivery])`
- `OrderModule` (para buscar/atualizar pedidos)
- `forwardRef(() => DriverModule)` (para buscar drivers)
- Importa `QueueModule` para `DeliveryMatchingProducer`

---

### DTOs

`create-delivery.dto.ts`:
```typescript
export class CreateDeliveryDto {
  @IsUUID() orderId: string;
}
```

`update-delivery-status.dto.ts`:
```typescript
export class UpdateDeliveryStatusDto {
  @IsEnum(DeliveryStatus) status: DeliveryStatus;
}
```

---

### MatchingService (`src/modules/delivery/matching.service.ts`)

```typescript
@Injectable()
export class MatchingService {
  private readonly MAX_RADIUS_KM = 15;
  private readonly RADIUS_INCREMENT_KM = 3;
  private readonly LOCK_TTL_MS = 30_000;

  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(Driver) private readonly driverRepository: Repository<Driver>,
    @InjectRepository(Delivery) private readonly deliveryRepository: Repository<Delivery>,
  ) {}

  async findBestDriver(restaurantLat: number, restaurantLng: number, initialRadiusKm = 3): Promise<string | null> {
    let radius = initialRadiusKm;
    while (radius <= this.MAX_RADIUS_KM) {
      const nearbyDriverIds = await this.redisService.geoSearch('drivers:geo', restaurantLng, restaurantLat, radius);
      if (nearbyDriverIds.length > 0) {
        const bestDriver = await this.scoreAndSelectDriver(nearbyDriverIds, restaurantLat, restaurantLng);
        if (bestDriver) return bestDriver;
      }
      radius += this.RADIUS_INCREMENT_KM;
    }
    return null;
  }

  private async scoreAndSelectDriver(driverIds: string[], lat: number, lng: number): Promise<string | null> {
    // 1. Buscar no DB apenas drivers disponíveis dos IDs retornados pelo GEO
    const drivers = await this.driverRepository.findBy({
      id: In(driverIds),
      isAvailable: true,
    });
    if (!drivers.length) return null;

    // 2. Para cada driver, calcular distância via Haversine e score
    const scored = drivers.map((d) => {
      const distance = haversineKm(lat, lng, Number(d.currentLatitude), Number(d.currentLongitude));
      const score = (1 / distance) * 0.6 + (Number(d.rating) / 5) * 0.4;
      return { id: d.id, score };
    });

    // 3. Ordenar por score decrescente, tentar lock no melhor disponível
    scored.sort((a, b) => b.score - a.score);
    for (const candidate of scored) {
      const locked = await this.redisService.acquireLock(`driver:${candidate.id}`, this.LOCK_TTL_MS);
      if (locked) return candidate.id;
    }
    return null;
  }

  async assignDriver(deliveryId: string, driverId: string): Promise<void> {
    const lockKey = `driver:${driverId}`;
    const locked = await this.redisService.acquireLock(lockKey, this.LOCK_TTL_MS);
    if (!locked) throw new ConflictException('Driver already being assigned to another delivery');

    try {
      await this.deliveryRepository.update(deliveryId, {
        driverId,
        status: DeliveryStatus.ASSIGNED,
      });
      await this.driverRepository.update(driverId, { isAvailable: false });
      await this.redisService.setDriverState(driverId, 'busy');
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }
}
```

**Score formula:** `score = (1 / distanceKm) * 0.6 + (rating / 5) * 0.4`

---

### DeliveryService (`src/modules/delivery/delivery.service.ts`)

**`create(dto)`:**
1. Buscar pedido com relations `['restaurant', 'customer']` — verificar status `ready` ou `confirmed`
2. Verificar que não existe `Delivery` já criado para o pedido
3. Criar `Delivery` com status `waiting`
4. Chamar `matchingService.findBestDriver(restaurant.latitude, restaurant.longitude)`
5. Se encontrou driver: chamar `matchingService.assignDriver(delivery.id, driverId)` — status → `assigned`
6. Se não encontrou: manter `waiting` (a fila da E9 tentará novamente via `DeliveryMatchingProducer`)
7. Retornar delivery com `order.deliveryFee` visível na resposta

> **Taxa de entrega**: o `Delivery` em si não armazena a taxa — ela já está capturada como snapshot em `order.deliveryFee` desde a criação do pedido (E5). O `DeliveryController.findOne` deve retornar o pedido com `deliveryFee`, `itemsTotal` e `totalAmount` nas relations para que o driver e o cliente vejam o detalhamento do valor.

**`updateStatus(id, dto, driverId)`:**
- Buscar delivery com relations `['driver', 'driver.user', 'order']`
- Verificar que `delivery.driver.userId === driverId` → `ForbiddenException`
- Transições válidas: `assigned → picked_up → delivered`
- Ao `delivered`:
  - Atualizar `delivery.deliveredAt = new Date()`
  - Chamar `OrderService.updateStatus(order.id, { status: DELIVERED }, driverId, 'driver')`
  - `driverRepository.update(driverId, { isAvailable: true })`
  - `redisService.setDriverState(driverId, 'available')`

**`findOne(id)`:** relations `['order', 'driver']`

**`findByDriver(driverId, page, limit)`:** paginado, relations `['order']`

**`findByOrder(orderId)`:** busca com relations `['driver', 'driver.user']`

**`getOrderLocation(orderId)`:** retorna `redisService.getOrderLocation(orderId)` — NotFoundException se null

---

### delivery.controller.ts

```
POST  /deliveries                    → create (@Roles('restaurant_owner'))
GET   /deliveries/driver/my          → findByDriver (@Roles('driver'))   — ANTES de /:id
GET   /deliveries/order/:orderId     → findByOrder (autenticado)         — ANTES de /:id
GET   /deliveries/:id                → findOne (autenticado)
PATCH /deliveries/:id/status         → updateStatus (@Roles('driver'))
GET   /deliveries/:orderId/location  → getOrderLocation (autenticado)
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e8-delivery-matching
git add src/modules/delivery
git commit -m "feat: add delivery module with geo-based driver matching and distributed lock"
git push origin feat/e8-delivery-matching
gh pr create \
  --title "feat: E8 - Delivery module + matching" \
  --base main \
  --body "## O que foi feito
- DeliveryModule com criação e atualização de entrega
- MatchingService: busca por raio usando Redis GEO (GEOSEARCH)
- Score = distância (60%) + rating (40%)
- Raio crescente: 3km → 6 → 9 → 12 → 15km
- Lock distribuído (SET NX PX 30s) para evitar dupla atribuição
- Ao finalizar: driver fica available no banco e Redis
- Endpoint REST para última localização conhecida

## Depende de
PRs E5 e E7 mergeados"
```

## Regras
- Lock no driver **ANTES** de atualizar banco — evita race condition em alta concorrência
- Sempre liberar lock no `finally` — nunca vazar lock mesmo com exceção
- Ao finalizar entrega (`delivered`): restaurar `isAvailable = true` no banco E no Redis
- `geoSearch` usa longitude primeiro, depois latitude — padrão Redis
- **NUNCA verificar `restaurant.isOpen` no matching ou na atribuição de driver** — a entrega foi gerada a partir de um pedido já existente, que é garantido independentemente do status atual do restaurante
