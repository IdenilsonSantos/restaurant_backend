import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '../constants/queue.constants';
import { DeliveryMatchingProducer } from '../producers/delivery-matching.producer';
import { NotificationsProducer } from '../producers/notifications.producer';
import { MatchingService } from '../../delivery/matching.service';

export interface MatchDriverJobData {
  deliveryId: string;
  restaurantLat: number;
  restaurantLng: number;
  attempt: number;
}

@Processor(QUEUES.DELIVERY_MATCHING)
export class DeliveryMatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryMatchingProcessor.name);

  constructor(
    private readonly matchingService: MatchingService,
    private readonly notificationsProducer: NotificationsProducer,
    private readonly producer: DeliveryMatchingProducer,
  ) {
    super();
  }

  async process(job: Job<MatchDriverJobData>): Promise<void> {
    const { deliveryId, restaurantLat, restaurantLng, attempt } = job.data;

    this.logger.log(
      `Processing delivery matching for delivery ${deliveryId} (attempt ${attempt})`,
    );

    try {
      const driverId = await this.matchingService.findBestDriver(
        restaurantLat,
        restaurantLng,
      );

      if (!driverId) {
        if (attempt < 5) {
          this.logger.warn(
            `No driver found for delivery ${deliveryId} on attempt ${attempt}. ` +
              `Re-enqueueing with delay (attempt ${attempt + 1})`,
          );
          await this.producer.enqueueMatching(
            deliveryId,
            restaurantLat,
            restaurantLng,
            attempt + 1,
          );
        } else {
          this.logger.error(
            `No driver found for delivery ${deliveryId} after ${attempt} attempts. ` +
              `Notifying restaurant of unavailability`,
          );
          // Future: enqueue a notification to the restaurant here
        }
        return;
      }

      await this.matchingService.assignDriver(deliveryId, driverId);
      this.logger.log(`Driver ${driverId} assigned to delivery ${deliveryId}`);

      await this.notificationsProducer.enqueueDeliveryRequest(
        deliveryId,
        driverId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error processing delivery matching for ${deliveryId}: ${message}`,
      );
      // Re-throw so BullMQ exponential backoff can retry on system errors
      throw error;
    }
  }
}
