import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES, JOBS } from '../constants/queue.constants';
import { OrderStatus } from '../../../common/enums/order-status.enum';

interface NotifyOrderStatusJobData {
  orderId: string;
  customerId: string;
  status: OrderStatus;
}

interface NotifyDeliveryRequestJobData {
  deliveryId: string;
  driverId: string;
}

@Processor(QUEUES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  process(
    job: Job<NotifyOrderStatusJobData | NotifyDeliveryRequestJobData>,
  ): Promise<void> {
    switch (job.name) {
      case JOBS.NOTIFY_ORDER_STATUS: {
        const data = job.data as NotifyOrderStatusJobData;
        this.logger.log(
          `Notifying customer ${data.customerId}: order ${data.orderId} → ${data.status}`,
        );
        break;
      }
      case JOBS.NOTIFY_DELIVERY_REQUEST: {
        const data = job.data as NotifyDeliveryRequestJobData;
        this.logger.log(
          `Notifying driver ${data.driverId}: delivery ${data.deliveryId}`,
        );
        break;
      }
      default:
        this.logger.warn(`Unknown notification job type: ${job.name}`);
    }
    return Promise.resolve();
  }
}
