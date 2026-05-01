import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from './entities/delivery.entity';
import { MatchingService } from './matching.service';
import { OrderService } from '../order/order.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { DeliveryStatus } from '../../common/enums/delivery-status.enum';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { DeliveryMatchingProducer } from '../queue/producers/delivery-matching.producer';

/** Valid status transitions a driver may request for their own delivery */
const ALLOWED_DRIVER_TRANSITIONS: Record<
  DeliveryStatus,
  DeliveryStatus | null
> = {
  [DeliveryStatus.WAITING]: null,
  [DeliveryStatus.ASSIGNED]: DeliveryStatus.PICKED_UP,
  [DeliveryStatus.PICKED_UP]: DeliveryStatus.DELIVERED,
  [DeliveryStatus.DELIVERED]: null,
  [DeliveryStatus.FAILED]: null,
};

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    private readonly matchingService: MatchingService,
    private readonly orderService: OrderService,
    private readonly deliveryMatchingProducer: DeliveryMatchingProducer,
  ) {}

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  async create(dto: CreateDeliveryDto): Promise<Delivery> {
    const order = await this.orderService.findOne(dto.orderId);

    const ELIGIBLE_ORDER_STATUSES: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.READY,
    ];

    if (!ELIGIBLE_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Order must be in status "confirmed" or "ready" to create a delivery, ` +
          `current status is "${order.status}"`,
      );
    }

    // Prevent duplicate delivery for the same order
    const existing = await this.deliveryRepository.findOne({
      where: { orderId: dto.orderId },
    });
    if (existing) {
      throw new BadRequestException(
        `A delivery already exists for order "${dto.orderId}"`,
      );
    }

    // Create the delivery row with WAITING status
    const delivery = this.deliveryRepository.create({
      orderId: dto.orderId,
      status: DeliveryStatus.WAITING,
      driverId: null,
    });
    const saved = await this.deliveryRepository.save(delivery);

    // Enqueue async driver matching via BullMQ.
    // The processor will attempt to find and assign a driver, retrying up to
    // 5 times with growing delays if no driver is available.
    await this.deliveryMatchingProducer.enqueueMatching(
      saved.id,
      Number(order.deliveryLatitude),
      Number(order.deliveryLongitude),
    );

    this.logger.log(
      `Delivery ${saved.id}: matching job enqueued for order ${dto.orderId}`,
    );

    return this.findOne(saved.id);
  }

  // ---------------------------------------------------------------------------
  // findOne
  // ---------------------------------------------------------------------------

  async findOne(id: string): Promise<Delivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id },
      relations: ['order', 'driver'],
    });

    if (!delivery) {
      throw new NotFoundException(`Delivery with id "${id}" not found`);
    }

    return delivery;
  }

  // ---------------------------------------------------------------------------
  // updateStatus (driver only)
  // ---------------------------------------------------------------------------

  async updateStatus(
    id: string,
    dto: UpdateDeliveryStatusDto,
    driverId: string,
  ): Promise<Delivery> {
    const delivery = await this.findOne(id);

    // Ensure this driver owns the delivery
    if (delivery.driverId !== driverId) {
      throw new ForbiddenException(
        'You are not the assigned driver for this delivery',
      );
    }

    const allowedNext = ALLOWED_DRIVER_TRANSITIONS[delivery.status];
    if (allowedNext === null || allowedNext !== dto.status) {
      throw new BadRequestException(
        `Invalid status transition from "${delivery.status}" to "${dto.status}"`,
      );
    }

    delivery.status = dto.status;

    if (dto.status === DeliveryStatus.PICKED_UP) {
      delivery.pickedUpAt = new Date();

      // Advance order: ready → picked_up
      await this.orderService.updateStatus(
        delivery.orderId,
        { status: OrderStatus.PICKED_UP },
        driverId,
        'driver',
      );
    }

    if (dto.status === DeliveryStatus.DELIVERED) {
      delivery.deliveredAt = new Date();

      // Advance order: picked_up → delivered
      await this.orderService.updateStatus(
        delivery.orderId,
        { status: OrderStatus.DELIVERED },
        driverId,
        'driver',
      );

      // Release the driver back to the available pool
      await this.matchingService.releaseDriver(driverId);
    }

    await this.deliveryRepository.save(delivery);

    return this.findOne(id);
  }

  // ---------------------------------------------------------------------------
  // findByDriver
  // ---------------------------------------------------------------------------

  async findByDriver(
    driverId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<Delivery>> {
    const [data, total] = await this.deliveryRepository.findAndCount({
      where: { driverId },
      relations: ['order'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ---------------------------------------------------------------------------
  // findByOrder
  // ---------------------------------------------------------------------------

  async findByOrder(orderId: string): Promise<Delivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { orderId },
      relations: ['order', 'driver'],
    });

    if (!delivery) {
      throw new NotFoundException(`Delivery for order "${orderId}" not found`);
    }

    return delivery;
  }
}
