---
name: delivery-e8-delivery-matching
description: Etapa 8 do sistema de delivery — implementa o DeliveryModule e o algoritmo de matching de entregadores usando Redis GEO, score por distância e rating, e lock distribuído. Depende das Etapas 5 e 7.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 8 — Delivery Module + Matching** do sistema de delivery.

## Pré-requisito
PRs das Etapas 5 e 7 mergeados na `main`.

## O que você deve criar

### DeliveryModule (`src/modules/delivery/`)

**delivery.module.ts** — importa TypeOrmModule com Delivery entity, importa OrderModule e RedisModule.

**DTOs:**

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
  constructor(
    private redisService: RedisService,
    private driverRepository: Repository<Driver>,
  ) {}

  async findBestDriver(
    restaurantLat: number,
    restaurantLng: number,
    initialRadiusKm = 3,
  ): Promise<string | null> {
    const MAX_RADIUS = 15;
    const RADIUS_INCREMENT = 3;
    let radius = initialRadiusKm;

    while (radius <= MAX_RADIUS) {
      const nearbyDriverIds = await this.redisService.geoSearch(
        'drivers:geo',
        restaurantLng,
        restaurantLat,
        radius,
      );

      if (nearbyDriverIds.length > 0) {
        const bestDriver = await this.scoreAndSelectDriver(nearbyDriverIds, restaurantLat, restaurantLng);
        if (bestDriver) return bestDriver;
      }

      radius += RADIUS_INCREMENT;
    }

    return null; // nenhum driver disponível
  }

  private async scoreAndSelectDriver(
    driverIds: string[],
    lat: number,
    lng: number,
  ): Promise<string | null> {
    // Buscar drivers disponíveis no banco
    // Calcular score: (1 / distancia) * 0.6 + (rating / 5) * 0.4
    // Ordenar por score desc
    // Tentar lock no melhor driver
    // Se lock falhar (já em outra corrida), tentar próximo
  }

  async assignDriver(deliveryId: string, driverId: string): Promise<void> {
    const lockKey = `driver:${driverId}`;
    const locked = await this.redisService.acquireLock(lockKey, 30000);
    if (!locked) throw new ConflictException('Driver already being assigned');

    try {
      // Atualizar delivery com driverId
      // Atualizar driver.isAvailable = false
      // Atualizar estado no Redis: driver:{id}:state = busy
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }
}
```

---

### DeliveryService (`src/modules/delivery/delivery.service.ts`)

**`create(dto)`:**
1. Buscar pedido — verificar status `ready` ou `confirmed`
2. Criar Delivery com status `waiting`
3. Chamar `MatchingService.findBestDriver`
4. Se encontrou driver: `assignDriver` e status → `assigned`
5. Se não encontrou: manter `waiting` (fila tentará novamente)

**`updateStatus(id, dto, driverId)`:**
- Validar que o driver é o dono da entrega
- Transições: `assigned` → `picked_up` → `delivered`
- Ao `delivered`: atualizar pedido para `delivered`, liberar driver (isAvailable = true, estado Redis)

**`findByDriver(driverId, page, limit)`:** histórico do driver

**`findByOrder(orderId)`:** busca entrega pelo pedido

---

### delivery.controller.ts

```
POST  /deliveries              → create (@Roles('restaurant_owner'))
GET   /deliveries/:id          → findOne (autenticado)
PATCH /deliveries/:id/status   → updateStatus (@Roles('driver'))
GET   /deliveries/driver/my    → findByDriver (@Roles('driver'))
GET   /deliveries/order/:orderId → findByOrder (autenticado)
```

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e8-delivery-matching`
3. Criar todos os arquivos
4. `git add src/modules/delivery`
5. `git commit -m "feat: add delivery module with geo-based driver matching and distributed lock"`
6. `git push origin feat/e8-delivery-matching`
7. `gh pr create --title "feat: E8 - Delivery module + matching" --base main --body "## O que foi feito\n- DeliveryModule com criação e atualização de entrega\n- MatchingService com busca por raio usando Redis GEO\n- Score por distância (60%) e rating (40%)\n- Fallback com raio crescente (3km → 6km → ... → 15km)\n- Lock distribuído para evitar dupla atribuição\n\n## Depende de\nPRs E5 e E7 mergeados"`

## Regras
- Lock no driver ANTES de atualizar banco — evita race condition
- Sempre liberar lock no finally
- Ao finalizar entrega, restaurar disponibilidade do driver no Redis E no banco
