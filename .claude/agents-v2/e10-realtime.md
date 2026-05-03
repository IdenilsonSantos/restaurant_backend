---
name: e10-realtime
description: Etapa 10 — implementa gateway Socket.IO com rooms por customer/restaurant/driver/order, tracking de localização em tempo real com Redis e endpoint REST de última posição. Fusão das antigas E10 e E11. Depende das E5, E8 e E9.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 10 — WebSocket + Real-time Tracking**.

## Pré-requisito
PRs das E5, E8 e E9 mergeados na `main`.

## Dependências a instalar
```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install -D @types/socket.io
```

## O que você deve criar

### EventsModule (`src/modules/events/`)

`events.module.ts` — módulo **@Global()** que exporta `EventsService` e `EventsGateway`.

---

### WsJwtGuard (`src/common/guards/ws-jwt.guard.ts`)

```typescript
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

### Tipos TypeScript

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

export interface RestaurantStatusPayload {
  restaurantId: string;
  isOpen: boolean;
  /** ISO 8601 — quando foi fechado. Null se aberto. */
  closedAt: string | null;
  /** Mensagem exibida ao usuário ex: "Abrimos às 18h", "Fechado hoje". Null se aberto. */
  closedMessage: string | null;
  /** ISO 8601 — reabertura agendada automática. Null se não houver. */
  scheduledReopenAt: string | null;
  /** Presente apenas ao fechar manualmente: pedidos em andamento que serão concluídos */
  activeOrdersCount?: number;
  updatedAt: string;
}
```

---

### EventsGateway (`src/modules/events/events.gateway.ts`)

```typescript
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly deliveryService: DeliveryService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake?.auth?.token
      ?? client.handshake?.headers?.authorization?.split(' ')[1];

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      await this.redisService.setOnline(payload.sub, 300);
      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);

      // Auto-join na room pessoal do usuário
      const role = payload.role;
      if (role === 'customer') await client.join(`customer:${payload.sub}`);
      if (role === 'restaurant_owner') await client.join(`restaurant:${payload.sub}`);
      if (role === 'driver') await client.join(`driver:${payload.sub}`);
    } catch {
      this.logger.warn(`Client ${client.id} disconnected: invalid token`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.user?.sub;
    if (userId) await this.redisService.setOffline(userId);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Cliente entra na room do pedido para acompanhar status e localização
  @SubscribeMessage('join:order')
  async handleJoinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    await client.join(`order:${data.orderId}`);
    this.logger.debug(`Client ${client.id} joined order:${data.orderId}`);
  }

  // Driver entra na sua room pessoal (além do auto-join)
  @SubscribeMessage('join:driver')
  async handleJoinDriver(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string },
  ) {
    await client.join(`driver:${data.driverId}`);
  }

  /**
   * Cliente entra na room de um restaurante específico para receber
   * atualizações de status (aberto/fechado) em tempo real.
   * Útil para a tela de detalhe do restaurante no app do cliente.
   */
  @SubscribeMessage('watch:restaurant')
  async handleWatchRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { restaurantId: string },
  ) {
    await client.join(`restaurant-status:${data.restaurantId}`);
    this.logger.debug(`Client ${client.id} watching restaurant:${data.restaurantId}`);
  }

  @SubscribeMessage('unwatch:restaurant')
  async handleUnwatchRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { restaurantId: string },
  ) {
    await client.leave(`restaurant-status:${data.restaurantId}`);
  }

  // Driver envia localização — validação de autorização + Redis + broadcast
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('driver:location')
  async handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; lat: number; lng: number },
  ) {
    const user = client.data.user;

    // Validar que o driver é responsável pelo pedido
    const delivery = await this.deliveryService.findByOrder(data.orderId);
    if (!delivery || delivery.driver?.user?.id !== user.sub) {
      client.emit('error', { message: 'Not authorized to update location for this order' });
      return;
    }

    // Salvar no Redis (TTL 1h)
    await this.redisService.setOrderLocation(data.orderId, data.lat, data.lng);

    // Atualizar GEO global de drivers
    await this.redisService.geoAdd('drivers:geo', data.lng, data.lat, delivery.driver.id);

    // Emitir para todos na room do pedido
    this.server.to(`order:${data.orderId}`).emit('location:update', {
      lat: data.lat,
      lng: data.lng,
      driverId: delivery.driver.id,
      timestamp: Date.now(),
    } satisfies LocationUpdatePayload);
  }
}
```

---

### EventsService (`src/modules/events/events.service.ts`)

Service para emitir eventos de outros módulos sem acessar o gateway diretamente:

```typescript
@Injectable()
export class EventsService {
  constructor(
    @InjectGateway(EventsGateway) private readonly gateway: EventsGateway,
  ) {}

  // Chamado por OrderService ao mudar status
  emitOrderUpdate(customerId: string, restaurantId: string, orderId: string, payload: OrderUpdatePayload) {
    this.gateway.server.to(`customer:${customerId}`).emit('order:update', payload);
    this.gateway.server.to(`restaurant:${restaurantId}`).emit('order:update', payload);
    this.gateway.server.to(`order:${orderId}`).emit('order:update', payload);
  }

  // Chamado por NotificationsProcessor ao atribuir entrega
  emitDeliveryRequest(driverId: string, payload: DeliveryRequestPayload) {
    this.gateway.server.to(`driver:${driverId}`).emit('delivery:request', payload);
  }

  // Chamado por OrderService ao criar pedido
  emitNewOrder(restaurantId: string, payload: object) {
    this.gateway.server.to(`restaurant:${restaurantId}`).emit('order:new', payload);
  }

  // Chamado por RestaurantService.setStatus() ao abrir/fechar manualmente
  emitRestaurantStatus(restaurantId: string, payload: RestaurantStatusPayload) {
    // Room do dashboard do dono (painel do restaurante)
    this.gateway.server
      .to(`restaurant:${restaurantId}`)
      .emit('restaurant:status', payload);

    // Room de clientes que estão assistindo este restaurante (tela de detalhe)
    this.gateway.server
      .to(`restaurant-status:${restaurantId}`)
      .emit('restaurant:status', payload);
  }
}
```

---

### Integrar EventsService nos módulos existentes

Verificar que os seguintes pontos já chamam `EventsService`:
- `OrderService.create()` → `eventsService.emitNewOrder(restaurantId, payload)`
- `OrderService.updateStatus()` → `eventsService.emitOrderUpdate(customerId, restaurantId, orderId, payload)`
- `NotificationsProcessor` (job `NOTIFY_DELIVERY_REQUEST`) → `eventsService.emitDeliveryRequest(driverId, payload)`
- `RestaurantService.setStatus()` → `eventsService.emitRestaurantStatus(restaurantId, payload)` — efeito imediato ao abrir/fechar

> `RestaurantModule` deve importar `EventsModule` (ou usar `forwardRef`) para injetar `EventsService` no `RestaurantService`.

Se não estiverem integrados, adicioná-los agora.

---

### TrackingService (`src/modules/delivery/tracking.service.ts`)

```typescript
@Injectable()
export class TrackingService {
  constructor(private readonly redisService: RedisService) {}

  async getLastLocation(orderId: string): Promise<{ lat: number; lng: number } | null> {
    return this.redisService.getOrderLocation(orderId);
  }

  async getDriversNearby(lat: number, lng: number, radiusKm: number): Promise<string[]> {
    return this.redisService.geoSearch('drivers:geo', lng, lat, radiusKm);
  }
}
```

Registrar no `DeliveryModule` e exportar.

---

### Rooms e eventos — tabela de referência

| Room | Evento emitido | Quando |
|---|---|---|
| `customer:{id}` | `order:update` | Status do pedido muda |
| `restaurant:{id}` | `order:new` | Novo pedido criado |
| `restaurant:{id}` | `order:update` | Status do pedido muda |
| `restaurant:{id}` | `restaurant:status` | Restaurante abre/fecha (painel do dono) |
| `restaurant-status:{id}` | `restaurant:status` | Restaurante abre/fecha (clientes assistindo) |
| `driver:{id}` | `delivery:request` | Entrega atribuída ao driver |
| `order:{id}` | `order:update` | Status muda |
| `order:{id}` | `location:update` | Driver envia localização |

**Como o cliente entra na room de status do restaurante:**
```javascript
// No app do cliente, ao abrir a tela de detalhe de um restaurante:
socket.emit('watch:restaurant', { restaurantId: 'uuid-do-restaurante' });

// Receber atualização em tempo real:
socket.on('restaurant:status', ({ restaurantId, isOpen, updatedAt }) => {
  if (!isOpen) mostrarBanner('Restaurante fechou');
  else mostrarBanner('Restaurante abriu');
});

// Ao sair da tela:
socket.emit('unwatch:restaurant', { restaurantId: 'uuid-do-restaurante' });
```

---

### Fluxo end-to-end documentado

```
1. Driver conecta via WebSocket com JWT no handshake.auth.token
2. Backend valida JWT → auto-join em driver:{sub}
3. Driver recebe 'delivery:request' com dados do pedido
4. Driver emite 'join:order' { orderId } → entra na room
5. Driver emite 'driver:location' { orderId, lat, lng } a cada N segundos
6. Backend valida autorização (delivery.driver.user.id === driver.sub)
7. Backend: SET order:{orderId}:location {lat,lng} EX 3600
8. Backend: GEOADD drivers:geo lng lat driverId
9. Backend emite para room order:{orderId}: 'location:update' { lat, lng, driverId, timestamp }
10. Customer (em join:order) recebe 'location:update' e atualiza mapa
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e10-realtime-tracking
git add src/modules/events src/modules/delivery/tracking.service.ts src/common/guards/ws-jwt.guard.ts
git commit -m "feat: add Socket.IO gateway with authenticated rooms, real-time tracking and events"
git push origin feat/e10-realtime-tracking
gh pr create \
  --title "feat: E10 - WebSocket + Real-time Tracking" \
  --base main \
  --body "## O que foi feito
- EventsGateway Socket.IO com auth JWT no handshake
- Auto-join na room pessoal por role (customer/restaurant/driver)
- driver:location handler com validação de autorização
- Redis: setOrderLocation (TTL 1h) + geoAdd ao receber localização
- EventsService para emitir de outros módulos (order:update, order:new, delivery:request)
- TrackingService para consultar última posição e drivers próximos
- WsJwtGuard para eventos que requerem autorização
- Tipos TypeScript para todos os payloads de eventos

## Depende de
PRs E5, E8 e E9 mergeados"
```

## Regras
- **NUNCA** usar `server.emit()` (broadcast global) — sempre rooms específicas
- Validar JWT na conexão e desconectar clientes sem token
- Driver só pode enviar localização para pedidos atribuídos a ele
- Localização expira no Redis após 1 hora (TTL)
- `@InjectGateway(EventsGateway)` para injetar o gateway no service — usar `@nestjs/websockets`
