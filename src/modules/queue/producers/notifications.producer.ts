import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES, JOBS } from '../constants/queue.constants';
import { OrderStatus } from '../../../common/enums/order-status.enum';

@Injectable()
export class NotificationsProducer {
  constructor(
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  async enqueueOrderStatusChange(
    orderId: string,
    customerId: string,
    status: OrderStatus,
  ): Promise<void> {
    await this.queue.add(JOBS.NOTIFY_ORDER_STATUS, {
      orderId,
      customerId,
      status,
    });
  }

  async enqueueDeliveryRequest(
    deliveryId: string,
    driverId: string,
  ): Promise<void> {
    await this.queue.add(JOBS.NOTIFY_DELIVERY_REQUEST, {
      deliveryId,
      driverId,
    });
  }
}
