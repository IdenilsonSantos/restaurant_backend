import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES, JOBS } from '../constants/queue.constants';

@Injectable()
export class DeliveryMatchingProducer {
  constructor(
    @InjectQueue(QUEUES.DELIVERY_MATCHING) private readonly queue: Queue,
  ) {}

  async enqueueMatching(
    deliveryId: string,
    restaurantLat: number,
    restaurantLng: number,
    attempt = 1,
  ): Promise<void> {
    await this.queue.add(
      JOBS.MATCH_DRIVER,
      { deliveryId, restaurantLat, restaurantLng, attempt },
      {
        // Delay increases with each retry attempt; first attempt is immediate
        delay: attempt > 1 ? attempt * 5000 : 0,
        // Unique jobId prevents duplicate jobs for the same delivery+attempt
        jobId: `match-${deliveryId}-${attempt}`,
      },
    );
  }
}
