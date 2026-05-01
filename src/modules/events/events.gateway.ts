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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        client.handshake?.auth?.token ??
        client.handshake?.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token — disconnecting`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.data.user = payload;

      // Mark user as online in Redis
      await this.redisService.setOnline(payload.sub);

      // Automatically join the personal room for the user's role
      if (payload.sub) {
        await client.join(`customer:${payload.sub}`);
        await client.join(`restaurant:${payload.sub}`);
        await client.join(`driver:${payload.sub}`);
      }

      this.logger.log(
        `Client connected: ${client.id} — user ${payload.sub} (role: ${payload.role})`,
      );
    } catch {
      this.logger.warn(`Client ${client.id} presented invalid token — disconnecting`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = client.data?.user?.sub;
    if (userId) {
      await this.redisService.setOffline(userId);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Client joins the room for a specific order to receive location and status updates.
   */
  @SubscribeMessage('join:order')
  async handleJoinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ): Promise<void> {
    await client.join(`order:${data.orderId}`);
    this.logger.log(`Client ${client.id} joined room order:${data.orderId}`);
  }

  /**
   * Driver explicitly joins their personal room (useful when the auto-join at
   * connection time is not sufficient, e.g. after an ID mismatch).
   */
  @SubscribeMessage('join:driver')
  async handleJoinDriver(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string },
  ): Promise<void> {
    await client.join(`driver:${data.driverId}`);
    this.logger.log(`Client ${client.id} joined room driver:${data.driverId}`);
  }

  /**
   * Driver sends their current GPS coordinates for an order.
   * Persists location to Redis and broadcasts to the order's room.
   */
  @SubscribeMessage('driver:location')
  async handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; lat: number; lng: number },
  ): Promise<void> {
    // Persist in Redis with TTL=3600s so the tracking endpoint can read it
    await this.redisService.setOrderLocation(data.orderId, data.lat, data.lng);

    // Emit only to the specific order room — never broadcast globally
    this.server.to(`order:${data.orderId}`).emit('location:update', {
      lat: data.lat,
      lng: data.lng,
      timestamp: Date.now(),
    });
  }
}
