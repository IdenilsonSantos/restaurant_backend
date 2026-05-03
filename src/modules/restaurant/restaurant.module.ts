import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Restaurant } from './entities/restaurant.entity';
import { Product } from './entities/product.entity';
import { RestaurantReview } from './entities/restaurant-review.entity';
import { UserFavoriteRestaurant } from './entities/user-favorite-restaurant.entity';
import { Order } from '../order/entities/order.entity';
import { PaymentMethod } from '../payment/entities/payment-method.entity';
import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Restaurant,
      Product,
      RestaurantReview,
      UserFavoriteRestaurant,
      Order,
      PaymentMethod,
    ]),
    StorageModule,
  ],
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}
