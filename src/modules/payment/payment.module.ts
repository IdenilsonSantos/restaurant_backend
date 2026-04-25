import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { PaymentService } from './payment.service';
import { PaymentMethodService } from './payment-method.service';
import { PaymentController } from './payment.controller';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, PaymentMethod]), OrderModule],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentMethodService],
  exports: [PaymentService, PaymentMethodService],
})
export class PaymentModule {}
