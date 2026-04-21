---
name: delivery-e10-websocket
description: Etapa 10 do sistema de delivery — implementa o gateway Socket.IO com rooms por customer, restaurant, driver e order. Eventos de pedido, entrega e localização em tempo real. Depende das Etapas 5, 8 e 9.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 10 — WebSocket (Socket.IO)** do sistema de delivery.

## Pré-requisito
PRs das Etapas 5, 8 e 9 mergeados na `main`.

## Dependências a instalar
```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install -D @types/socket.io
```

## O que você deve criar

### EventsModule (`src/modules/events/`)

**events.module.ts** — módulo global que provê o gateway.

---

### EventsGateway (`src/modules/events/events.gateway.ts`)

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  async handleConnection(client: Socket) {
    // Extrair e validar JWT do handshake
    // client.handshake.auth.token ou client.handshake.headers.authorization
    // Se inválido: client.disconnect()
    // Logar conexão
  }

  async handleDisconnect(client: Socket) {
    // Marcar usuário como offline no Redis
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Cliente entra na room do seu pedido
  @SubscribeMessage('join:order')
  async handleJoinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    await client.join(`order:${data.orderId}`);
  }

  // Driver envia localização
  @SubscribeMessage('driver:location')
  async handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; lat: number; lng: number },
  ) {
    // Salvar no Redis via RedisService
    // Emitir para room do pedido
    this.server.to(`order:${data.orderId}`).emit('location:update', {
      lat: data.lat,
      lng: data.lng,
      timestamp: Date.now(),
    });
  }

  // Driver entra na sua room pessoal
  @SubscribeMessage('join:driver')
  async handleJoinDriver(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string },
  ) {
    await client.join(`driver:${data.driverId}`);
  }
}
```

---

### EventsService (`src/modules/events/events.service.ts`)

Service para emitir eventos a partir de outros módulos:

```typescript
@Injectable()
export class EventsService {
  constructor(
    @InjectGateway(EventsGateway) private gateway: EventsGateway,
  ) {}

  // Chamado pelo OrderService ao mudar status
  emitOrderUpdate(customerId: string, restaurantId: string, orderId: string, payload: object) {
    this.gateway.server.to(`customer:${customerId}`).emit('order:update', payload);
    this.gateway.server.to(`restaurant:${restaurantId}`).emit('order:update', payload);
    this.gateway.server.to(`order:${orderId}`).emit('order:update', payload);
  }

  // Chamado pelo NotificationsProcessor ao receber corrida
  emitDeliveryRequest(driverId: string, payload: object) {
    this.gateway.server.to(`driver:${driverId}`).emit('delivery:request', payload);
  }

  // Chamado quando pedido é criado
  emitNewOrder(restaurantId: string, payload: object) {
    this.gateway.server.to(`restaurant:${restaurantId}`).emit('order:new', payload);
  }
}
```

---

### WsJwtGuard (`src/common/guards/ws-jwt.guard.ts`)

Guard para validar JWT em conexões WebSocket:
```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    const token = client.handshake?.auth?.token;
    if (!token) throw new WsException('Unauthorized');

    try {
      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      return true;
    } catch {
      throw new WsException('Invalid token');
    }
  }
}
```

---

### Integrar EventsService nos módulos existentes

- **OrderService.updateStatus**: chamar `EventsService.emitOrderUpdate`
- **OrderService.create**: chamar `EventsService.emitNewOrder`
- **NotificationsProcessor** (E9): chamar `EventsService.emitDeliveryRequest`

---

### Rooms e eventos — resumo

| Room | Evento emitido | Quando |
|------|----------------|--------|
| `customer:{id}` | `order:update` | Status do pedido muda |
| `restaurant:{id}` | `order:new` | Novo pedido criado |
| `restaurant:{id}` | `order:update` | Status muda |
| `driver:{id}` | `delivery:request` | Entrega atribuída |
| `order:{id}` | `order:update` | Status muda |
| `order:{id}` | `location:update` | Driver envia localização |

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e10-websocket`
3. Criar todos os arquivos
4. `git add src/modules/events src/common/guards/ws-jwt.guard.ts`
5. `git commit -m "feat: add Socket.IO gateway with authenticated rooms and real-time events"`
6. `git push origin feat/e10-websocket`
7. `gh pr create --title "feat: E10 - WebSocket real-time events" --base main --body "## O que foi feito\n- EventsGateway com Socket.IO\n- Rooms: customer, restaurant, driver, order\n- Eventos: order:new, order:update, delivery:request, driver:location, location:update\n- WsJwtGuard para autenticação de conexões\n- EventsService para emitir eventos a partir de outros módulos\n\n## Depende de\nPRs E5, E8 e E9 mergeados"`

## Regras
- NUNCA usar broadcast global (server.emit) — sempre rooms específicas
- Validar JWT na conexão — desconectar clientes sem token válido
- Driver pode apenas emitir localização para pedidos atribuídos a ele
