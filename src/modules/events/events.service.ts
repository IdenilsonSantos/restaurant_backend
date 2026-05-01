import { Injectable, Logger } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly gateway: EventsGateway) {}

  /**
   * Emits an order status update to all relevant parties:
   * - the customer who placed the order
   * - the restaurant that owns the order
   * - any client subscribed to the specific order room
   *
   * Called by OrderService.updateStatus and OrderService.cancel.
   */
  emitOrderUpdate(
    customerId: string,
    restaurantId: string,
    orderId: string,
    payload: object,
  ): void {
    this.gateway.server
      .to(`customer:${customerId}`)
      .emit('order:update', payload);

    this.gateway.server
      .to(`restaurant:${restaurantId}`)
      .emit('order:update', payload);

    this.gateway.server
      .to(`order:${orderId}`)
      .emit('order:update', payload);

    this.logger.debug(
      `Emitted order:update for order ${orderId} ` +
        `to customer:${customerId}, restaurant:${restaurantId}, order:${orderId}`,
    );
  }

  /**
   * Emits a delivery assignment request directly to the assigned driver's room.
   * Called by NotificationsProcessor when a driver is matched to a delivery.
   */
  emitDeliveryRequest(driverId: string, payload: object): void {
    this.gateway.server
      .to(`driver:${driverId}`)
      .emit('delivery:request', payload);

    this.logger.debug(
      `Emitted delivery:request to driver:${driverId}`,
    );
  }

  /**
   * Emits a new-order notification to the restaurant's room.
   * Called by OrderService.create after the order is persisted.
   */
  emitNewOrder(restaurantId: string, payload: object): void {
    this.gateway.server
      .to(`restaurant:${restaurantId}`)
      .emit('order:new', payload);

    this.logger.debug(
      `Emitted order:new to restaurant:${restaurantId}`,
    );
  }
}
