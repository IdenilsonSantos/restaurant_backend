import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Delivery } from './entities/delivery.entity';
import { Driver } from '../driver/entities/driver.entity';
import { OrderModule } from '../order/order.module';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { MatchingService } from './matching.service';
import { DeliveryMatchingProducer } from '../queue/producers/delivery-matching.producer';
import { QUEUES } from '../queue/constants/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery, Driver]),
    forwardRef(() => OrderModule),
    BullModule.registerQueue({ name: QUEUES.DELIVERY_MATCHING }),
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService, MatchingService, DeliveryMatchingProducer],
  exports: [DeliveryService, MatchingService, DeliveryMatchingProducer],
})
export class DeliveryModule {}
