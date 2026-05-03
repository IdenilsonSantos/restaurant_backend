---
name: e10-realtime
description: Etapa 10 — implementa gateway Socket.IO com rooms por customer/restaurant/driver/order, tracking de localização em tempo real com Redis. Fusão de E10 e E11. Depende das E5, E8 e E9.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 10 — WebSocket + Real-time Tracking.

## Pré-requisito
PRs E5, E8 e E9 mergeados.

## Dependências
```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install -D @types/socket.io
```

## EventsModule (`src/modules/events/`)

Módulo **@Global()** — exporta `EventsService` e `EventsGateway`.

---

## WsJwtGuard

```typescript
// src/common/guards/ws-jwt.guard.ts
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const token = client.handshake?.auth?.token
      ?? client.handshake?.headers?.authorization?.split(' ')[1];

    if (!token) throw new WsException('Unauthorized: missing token');
    try {
      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      return true;
    } catch {
      throw new WsException('Unauthorized: invalid token');
    }
  }
}
```

---

## Tipos (`src/modules/events/types/events.types.ts`)

```typescript
export interface LocationUpdatePayload  { lat: number; lng: number; driverId: string; timestamp: number; }
export interface OrderUpdatePayload     { orderId: string; status: string; updatedAt: string; }
export interface DeliveryRequestPayload { deliveryId: string; orderId: string; pickupAddress: string; deliveryAddress: string; restaurantLat: number; restaurantLng: number; }
export interface RestaurantStatusPayload {
  restaurantId: string; isOpen: boolean;
  closedAt: string | null; closedMessage: string | null; scheduledReopenAt: string | null;
  activeOrdersCount?: number; updatedAt: string;
}
```

---

## EventsGateway

```typescript
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  async handleConnection(client: Socket) {
    const token = client.handshake?.auth?.token
      ?? client.handshake?.headers?.authorization?.split(' ')[1];
    if (!token) { client.disconnect(); return; }

    try {
      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      await this.redisService.setOnline(payload.sub, 300);

      // Auto-join na room pessoal por role
      if (payload.role === 'customer')          await client.join(`customer:${payload.sub}`);
      if (payload.role === 'restaurant_owner')  await client.join(`restaurant:${payload.sub}`);
      if (payload.role === 'driver')            await client.join(`driver:${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.user?.sub;
    if (userId) await this.redisService.setOffline(userId);
  }

  @SubscribeMessage('join:order')
  async handleJoinOrder(@ConnectedSocket() client: Socket, @MessageBody() data: { orderId: string }) {
    await client.join(`order:${data.orderId}`);
  }

  @SubscribeMessage('watch:restaurant')
  async handleWatchRestaurant(@ConnectedSocket() client: Socket, @MessageBody() data: { restaurantId: string }) {
    await client.join(`restaurant-status:${data.restaurantId}`);
  }

  @SubscribeMessage('unwatch:restaurant')
  async handleUnwatchRestaurant(@ConnectedSocket() client: Socket, @MessageBody() data: { restaurantId: string }) {
    await client.leave(`restaurant-status:${data.restaurantId}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('driver:location')
  async handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; lat: number; lng: number },
  ) {
    const user = client.data.user;
    const delivery = await this.deliveryService.findByOrder(data.orderId);
    if (!delivery || delivery.driver?.user?.id !== user.sub) {
      client.emit('error', { message: 'Not authorized to update location for this order' });
      return;
    }

    await this.redisService.setOrderLocation(data.orderId, data.lat, data.lng);
    await this.redisService.geoAdd('drivers:geo', data.lng, data.lat, delivery.driver.id);

    this.server.to(`order:${data.orderId}`).emit('location:update', {
      lat: data.lat, lng: data.lng,
      driverId: delivery.driver.id,
      timestamp: Date.now(),
    } satisfies LocationUpdatePayload);
  }
}
```

Construtor injeta: `JwtService`, `RedisService`, `DeliveryService`.

---

## EventsService

```typescript
// src/modules/events/events.service.ts
@Injectable()
export class EventsService {
  constructor(@InjectGateway(EventsGateway) private readonly gateway: EventsGateway) {}

  emitOrderUpdate(customerId: string, restaurantId: string, orderId: string, payload: OrderUpdatePayload) {
    this.gateway.server.to(`customer:${customerId}`).emit('order:update', payload);
    this.gateway.server.to(`restaurant:${restaurantId}`).emit('order:update', payload);
    this.gateway.server.to(`order:${orderId}`).emit('order:update', payload);
  }

  emitDeliveryRequest(driverId: string, payload: DeliveryRequestPayload) {
    this.gateway.server.to(`driver:${driverId}`).emit('delivery:request', payload);
  }

  emitNewOrder(restaurantId: string, payload: object) {
    this.gateway.server.to(`restaurant:${restaurantId}`).emit('order:new', payload);
  }

  emitRestaurantStatus(restaurantId: string, payload: RestaurantStatusPayload) {
    this.gateway.server.to(`restaurant:${restaurantId}`).emit('restaurant:status', payload);
    this.gateway.server.to(`restaurant-status:${restaurantId}`).emit('restaurant:status', payload);
  }
}
```

---

## Rooms e eventos

| Room | Evento | Quando |
|---|---|---|
| `customer:{id}` | `order:update` | Status do pedido muda |
| `restaurant:{id}` | `order:new` | Novo pedido criado |
| `restaurant:{id}` | `order:update` | Status do pedido muda |
| `restaurant:{id}` | `restaurant:status` | Restaurante abre/fecha (painel do dono) |
| `restaurant-status:{id}` | `restaurant:status` | Restaurante abre/fecha (clientes assistindo) |
| `driver:{id}` | `delivery:request` | Entrega atribuída |
| `order:{id}` | `order:update` | Status muda |
| `order:{id}` | `location:update` | Driver envia localização |

---

## TrackingService (`src/modules/delivery/tracking.service.ts`)

- `getLastLocation(orderId)` → `redisService.getOrderLocation(orderId)`
- `getDriversNearby(lat, lng, radiusKm)` → `redisService.geoSearch('drivers:geo', lng, lat, radiusKm)`

Registrar no `DeliveryModule` e exportar.

---

## Integrações a verificar

- `OrderService.create()` → `eventsService.emitNewOrder(...)`
- `OrderService.updateStatus()` → `eventsService.emitOrderUpdate(...)`
- `NotificationsProcessor` (NOTIFY_DELIVERY_REQUEST) → `eventsService.emitDeliveryRequest(...)`
- `RestaurantService.setStatus()` → `eventsService.emitRestaurantStatus(...)`

`RestaurantModule` deve importar `EventsModule` (ou `forwardRef`) para injetar `EventsService`.

## Commit
```bash
git checkout -b feat/e10-realtime-tracking
git add src/modules/events src/modules/delivery/tracking.service.ts src/common/guards/ws-jwt.guard.ts
git commit -m "feat: add Socket.IO gateway with authenticated rooms, real-time tracking and events"
```

## Regras
- **NUNCA** `server.emit()` — sempre rooms específicas
- JWT validado na conexão — desconectar clientes sem token
- Driver só pode enviar localização para pedidos atribuídos a ele
- Localização expira no Redis após 1 hora (TTL)
