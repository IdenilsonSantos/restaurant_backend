---
name: delivery-e11-tracking
description: Etapa 11 do sistema de delivery — implementa o tracking em tempo real com driver enviando localização via WebSocket, Redis salvando posição e cliente recebendo updates. Depende das Etapas 7 e 10.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 11 — Tracking em Tempo Real** do sistema de delivery.

## Pré-requisito
PRs das Etapas 7 e 10 mergeados na `main`.

## O que você deve criar/completar

Esta etapa finaliza e integra o fluxo completo de tracking que foi parcialmente preparado nas etapas anteriores.

### 1. Completar handler `driver:location` no EventsGateway

Atualizar o handler existente no `EventsGateway` da E10:

```typescript
@SubscribeMessage('driver:location')
async handleDriverLocation(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { orderId: string; lat: number; lng: number },
) {
  const user = client.data.user; // injetado pelo WsJwtGuard

  // 1. Validar que o driver é o responsável pelo pedido
  const delivery = await this.deliveryService.findByOrder(data.orderId);
  if (!delivery || delivery.driver?.user?.id !== user.sub) {
    client.emit('error', { message: 'Not authorized to update this order location' });
    return;
  }

  // 2. Salvar no Redis (TTL 1h)
  await this.redisService.setOrderLocation(data.orderId, data.lat, data.lng);

  // 3. Atualizar GEO do driver
  await this.redisService.geoAdd('drivers:geo', data.lng, data.lat, delivery.driver.id);

  // 4. Emitir para room do pedido
  this.server.to(`order:${data.orderId}`).emit('location:update', {
    lat: data.lat,
    lng: data.lng,
    driverId: delivery.driver.id,
    timestamp: Date.now(),
  });
}
```

### 2. Endpoint REST de localização atual

Adicionar no `DeliveryController`:

```typescript
// GET /deliveries/:orderId/location
async getOrderLocation(@Param('orderId') orderId: string) {
  const location = await this.redisService.getOrderLocation(orderId);
  if (!location) throw new NotFoundException('Location not available');
  return location;
}
```

### 3. TrackingService (`src/modules/delivery/tracking.service.ts`)

```typescript
@Injectable()
export class TrackingService {
  constructor(private redisService: RedisService) {}

  async getLastLocation(orderId: string) {
    return this.redisService.getOrderLocation(orderId);
  }

  async getDriversNearby(lat: number, lng: number, radiusKm: number) {
    const driverIds = await this.redisService.geoSearch('drivers:geo', lng, lat, radiusKm);
    return driverIds;
  }
}
```

### 4. Fluxo completo documentado

Garantir que o fluxo abaixo funciona end-to-end:

```
1. Driver conecta via WebSocket com JWT válido
2. Driver entra na room: socket.emit('join:driver', { driverId })
3. Driver recebe 'delivery:request' com dados do pedido
4. Driver emite 'driver:location' a cada N segundos: { orderId, lat, lng }
5. Backend salva no Redis: SET order:{orderId}:location {lat,lng} EX 3600
6. Backend atualiza GEO: GEOADD drivers:geo lng lat driverId
7. Backend emite para room order:{orderId}: 'location:update' { lat, lng, timestamp }
8. Cliente (que fez join:order) recebe 'location:update' e atualiza mapa
```

### 5. Tipos TypeScript para eventos

`src/modules/events/types/events.types.ts`:
```typescript
export interface LocationUpdatePayload {
  lat: number;
  lng: number;
  driverId: string;
  timestamp: number;
}

export interface OrderUpdatePayload {
  orderId: string;
  status: string;
  updatedAt: string;
}

export interface DeliveryRequestPayload {
  deliveryId: string;
  orderId: string;
  pickupAddress: string;
  deliveryAddress: string;
  restaurantLat: number;
  restaurantLng: number;
}
```

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e11-realtime-tracking`
3. Criar/modificar os arquivos
4. `git add src/modules/delivery/tracking.service.ts src/modules/events`
5. `git commit -m "feat: complete real-time tracking with Redis and WebSocket integration"`
6. `git push origin feat/e11-realtime-tracking`
7. `gh pr create --title "feat: E11 - Real-time location tracking" --base main --body "## O que foi feito\n- Tracking completo: driver → Redis → WebSocket → cliente\n- Validação de autorização no envio de localização\n- Endpoint REST para última localização conhecida\n- TrackingService para consultas de localização\n- Tipos TypeScript para todos os eventos\n\n## Depende de\nPRs E7 e E10 mergeados\n\n## Fluxo\nDriver emite driver:location → Redis salva → socket emite location:update → cliente atualiza mapa"`

## Regras
- Driver só pode enviar localização para pedidos atribuídos a ele
- Localização expira no Redis após 1 hora (TTL)
- Emitir apenas para room `order:{id}` — nunca para todos
