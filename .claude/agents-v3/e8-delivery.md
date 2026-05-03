---
name: e8-delivery
description: Etapa 8 — implementa DeliveryModule e o algoritmo de matching de entregadores usando Redis GEO, score por distância e rating, e lock distribuído. Depende das E5 e E7.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 8 — Delivery Module + Matching.

## Pré-requisito
PRs E5 e E7 mergeados.

## DeliveryModule (`src/modules/delivery/`)

Importa: `TypeOrmModule.forFeature([Delivery])`, `OrderModule`, `forwardRef(() => DriverModule)`, `QueueModule` (para `DeliveryMatchingProducer`).

---

## DTOs

**create-delivery.dto.ts**: orderId (UUID)

**update-delivery-status.dto.ts**: status (enum DeliveryStatus)

---

## MatchingService (`src/modules/delivery/matching.service.ts`)

Algoritmo de busca de driver. Manter como código — é fácil errar a ordem de operações:

```typescript
async findBestDriver(restaurantLat: number, restaurantLng: number, initialRadiusKm = 3): Promise<string | null> {
  let radius = initialRadiusKm;
  while (radius <= 15) {
    const nearbyIds = await this.redisService.geoSearch('drivers:geo', restaurantLng, restaurantLat, radius);
    if (nearbyIds.length > 0) {
      const best = await this.scoreAndSelectDriver(nearbyIds, restaurantLat, restaurantLng);
      if (best) return best;
    }
    radius += 3;
  }
  return null;
}

private async scoreAndSelectDriver(driverIds: string[], lat: number, lng: number): Promise<string | null> {
  const drivers = await this.driverRepository.findBy({ id: In(driverIds), isAvailable: true });
  if (!drivers.length) return null;

  const scored = drivers.map((d) => ({
    id: d.id,
    score: (1 / haversineKm(lat, lng, Number(d.currentLatitude), Number(d.currentLongitude))) * 0.6
         + (Number(d.rating) / 5) * 0.4,
  }));
  scored.sort((a, b) => b.score - a.score);

  for (const candidate of scored) {
    const locked = await this.redisService.acquireLock(`driver:${candidate.id}`, 30_000);
    if (locked) return candidate.id;
  }
  return null;
}

async assignDriver(deliveryId: string, driverId: string): Promise<void> {
  const lockKey = `driver:${driverId}`;
  const locked = await this.redisService.acquireLock(lockKey, 30_000);
  if (!locked) throw new ConflictException('Driver already being assigned');

  try {
    await this.deliveryRepository.update(deliveryId, { driverId, status: DeliveryStatus.ASSIGNED });
    await this.driverRepository.update(driverId, { isAvailable: false });
    await this.redisService.setDriverState(driverId, 'busy');
  } finally {
    await this.redisService.releaseLock(lockKey);
  }
}
```

**Score:** `(1/distanceKm)*0.6 + (rating/5)*0.4` | **Raio:** 3 → 6 → 9 → 12 → 15 km

---

## DeliveryService — métodos

**create(dto)**
1. Buscar pedido com relations `['restaurant', 'customer']` — verificar status `ready` ou `confirmed`
2. Verificar que não existe Delivery para o pedido
3. Criar Delivery com `status=waiting`
4. Chamar `matchingService.findBestDriver(restaurant.latitude, restaurant.longitude)`
5. Se encontrou driver: `matchingService.assignDriver(delivery.id, driverId)` → status `assigned`
6. Se não encontrou: manter `waiting`; fila da E9 tentará novamente

> Taxa de entrega não é armazenada no Delivery — já está em `order.deliveryFee` como snapshot desde a E5.

**updateStatus(id, dto, driverId)**
1. Buscar com relations `['driver', 'driver.user', 'order']`
2. Verificar `delivery.driver.userId === driverId` → `ForbiddenException`
3. Transições válidas: `assigned → picked_up → delivered`
4. Ao `delivered`: setar `deliveredAt`, chamar `OrderService.updateStatus(→ DELIVERED)`, restaurar `isAvailable=true` no banco e no Redis

**findOne(id)** — relations `['order', 'driver']`

**findByDriver(driverId, page, limit)** — paginado, relations `['order']`

**findByOrder(orderId)** — relations `['driver', 'driver.user']`

**getOrderLocation(orderId)** — retorna `redisService.getOrderLocation(orderId)`; `NotFoundException` se null

---

## Endpoints

```
POST  /deliveries                   → create (@Roles('restaurant_owner'))
GET   /deliveries/driver/my         → findByDriver (@Roles('driver'))    ← ANTES de /:id
GET   /deliveries/order/:orderId    → findByOrder (autenticado)          ← ANTES de /:id
GET   /deliveries/:id               → findOne (autenticado)
PATCH /deliveries/:id/status        → updateStatus (@Roles('driver'))
GET   /deliveries/:orderId/location → getOrderLocation (autenticado)
```

## Commit
```bash
git checkout -b feat/e8-delivery-matching
git add src/modules/delivery
git commit -m "feat: add delivery module with geo-based driver matching and distributed lock"
```

## Regras
- Lock no driver **antes** de atualizar banco — evita race condition
- Lock liberado no `finally` — nunca vazar mesmo com exceção
- Ao finalizar entrega: restaurar `isAvailable=true` no banco **e** no Redis
- **NUNCA verificar `restaurant.isOpen` no matching** — a entrega veio de pedido já existente
