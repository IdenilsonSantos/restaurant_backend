import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { OrderService } from '../order/order.service';
import { PaymentMethodService } from './payment-method.service';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { OrderStatus } from '../../common/enums/order-status.enum';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly orderService: OrderService,
    private readonly paymentMethodService: PaymentMethodService,
  ) {}

  async initiate(customerId: string, dto: CreatePaymentDto): Promise<Payment> {
    const [order] = await Promise.all([
      this.orderService.findOne(dto.orderId),
      this.paymentMethodService.findOne(dto.paymentMethodId),
    ]);

    if (order.customerId !== customerId) {
      throw new ForbiddenException(
        'You are not allowed to initiate payment for this order',
      );
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Payment can only be initiated for orders in "pending" status, current status is "${order.status}"`,
      );
    }

    const existing = await this.paymentRepository.findOne({
      where: { orderId: dto.orderId },
    });

    if (existing) {
      throw new ConflictException(
        `A payment already exists for order "${dto.orderId}"`,
      );
    }

    const payment = this.paymentRepository.create({
      orderId: dto.orderId,
      paymentMethodId: dto.paymentMethodId,
      amount: order.totalAmount,
      status: PaymentStatus.PENDING,
      externalId: dto.externalId ?? null,
    });

    return this.paymentRepository.save(payment);
  }

  async confirm(paymentId: string, dto: ConfirmPaymentDto): Promise<Payment> {
    const payment = await this.findOne(paymentId);

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(
        `Only pending payments can be confirmed, current status is "${payment.status}"`,
      );
    }

    payment.status = PaymentStatus.CONFIRMED;
    payment.externalId = dto.externalId;
    payment.confirmedAt = new Date();

    const saved = await this.paymentRepository.save(payment);

    await this.orderService.updateStatus(
      payment.orderId,
      { status: OrderStatus.CONFIRMED },
      'system',
      'restaurant_owner',
    );

    return saved;
  }

  async fail(paymentId: string): Promise<Payment> {
    const payment = await this.findOne(paymentId);

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(
        `Only pending payments can be marked as failed, current status is "${payment.status}"`,
      );
    }

    payment.status = PaymentStatus.FAILED;
    return this.paymentRepository.save(payment);
  }

  async findByOrder(orderId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment for order "${orderId}" not found`);
    }

    return payment;
  }

  async findOne(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({ where: { id } });

    if (!payment) {
      throw new NotFoundException(`Payment with id "${id}" not found`);
    }

    return payment;
  }
}
