import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUES } from './constants/queue.constants';
import { NotificationsProducer } from './producers/notifications.producer';
import { DeliveryMatchingProcessor } from './processors/delivery-matching.processor';
import { NotificationsProcessor } from './processors/notifications.processor';
import { DeliveryModule } from '../delivery/delivery.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL') },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUES.DELIVERY_MATCHING },
      { name: QUEUES.NOTIFICATIONS },
    ),
    DeliveryModule,
  ],
  providers: [
    NotificationsProducer,
    DeliveryMatchingProcessor,
    NotificationsProcessor,
  ],
  exports: [BullModule, NotificationsProducer],
})
export class QueueModule {}
