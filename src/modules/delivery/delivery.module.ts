import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Delivery } from './entities/delivery.entity';
import { Driver } from '../driver/entities/driver.entity';
import { OrderModule } from '../order/order.module';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { MatchingService } from './matching.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery, Driver]),
    OrderModule,
    // RedisModule is @Global() so RedisService is available without explicit import
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService, MatchingService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
