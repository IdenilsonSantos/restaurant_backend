import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { RestaurantService } from '../restaurant/restaurant.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { ORDER_TRANSITIONS } from './constants/order-transitions.constant';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { NotificationsProducer } from '../queue/producers/notifications.producer';
import { EventsService } from '../events/events.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    private readonly restaurantService: RestaurantService,
    private readonly notificationsProducer: NotificationsProducer,
    private readonly eventsService: EventsService,
  ) {}

  async create(customerId: string, dto: CreateOrderDto): Promise<Order> {
    const restaurant = await this.restaurantService.findOne(dto.restaurantId);

    if (!restaurant.isOpen) {
      throw new NotFoundException(
        `Restaurant with id "${dto.restaurantId}" is not open`,
      );
    }

    const productIds = dto.items.map((item) => item.productId);
    const products = await this.restaurantService.findProductsByIds(
      dto.restaurantId,
      productIds,
    );

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'One or more products not found, unavailable, or do not belong to this restaurant',
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalAmount = 0;
    const orderItemsData = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const subtotal = Number(product.price) * item.quantity;
      totalAmount += subtotal;
      return {
        productId: product.id,
        productName: product.name,
        productPrice: Number(product.price),
        quantity: item.quantity,
        subtotal,
      };
    });

    const order = this.orderRepository.create({
      customerId,
      restaurantId: dto.restaurantId,
      status: OrderStatus.PENDING,
      totalAmount,
      deliveryAddress: dto.deliveryAddress,
      deliveryLatitude: dto.deliveryLatitude,
      deliveryLongitude: dto.deliveryLongitude,
      notes: dto.notes ?? null,
    });

    const savedOrder = await this.orderRepository.save(order);

    const orderItems = orderItemsData.map((itemData) =>
      this.orderItemRepository.create({
        ...itemData,
        orderId: savedOrder.id,
      }),
    );

    await this.orderItemRepository.save(orderItems);

    const createdOrder = await this.findOne(savedOrder.id);

    // Real-time: notify the restaurant about the new order
    this.eventsService.emitNewOrder(createdOrder.restaurantId, {
      orderId: createdOrder.id,
      status: createdOrder.status,
      totalAmount: createdOrder.totalAmount,
      customerId: createdOrder.customerId,
    });

    return createdOrder;
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['items', 'restaurant', 'customer'],
    });

    if (!order) {
      throw new NotFoundException(`Order with id "${id}" not found`);
    }

    return order;
  }

  async findByCustomer(
    customerId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResult<Order>> {
    const [data, total] = await this.orderRepository.findAndCount({
      where: { customerId },
      relations: ['items', 'restaurant'],
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

  async findByRestaurant(
    restaurantId: string,
    page: number = 1,
    limit: number = 10,
    status?: OrderStatus,
  ): Promise<PaginatedResult<Order>> {
    const where: Record<string, unknown> = { restaurantId };

    if (status) {
      where['status'] = status;
    }

    const [data, total] = await this.orderRepository.findAndCount({
      where,
      relations: ['items', 'customer'],
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

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    requesterId: string,
    requesterRole: string,
  ): Promise<Order> {
    const order = await this.findOne(id);

    const allowedTransitions = ORDER_TRANSITIONS[order.status];
    const transition = allowedTransitions.find((t) => t.next === dto.status);

    if (!transition) {
      throw new BadRequestException(
        `Invalid status transition from "${order.status}" to "${dto.status}"`,
      );
    }

    if (!transition.allowedRoles.includes(requesterRole)) {
      throw new ForbiddenException(
        `Role "${requesterRole}" is not allowed to transition order from "${order.status}" to "${dto.status}"`,
      );
    }

    order.status = dto.status;
    await this.orderRepository.save(order);

    // Enqueue async notification for the customer about the status change
    await this.notificationsProducer.enqueueOrderStatusChange(
      order.id,
      order.customerId,
      dto.status,
    );

    const updatedOrder = await this.findOne(id);

    // Real-time: notify all parties about the status change
    this.eventsService.emitOrderUpdate(
      updatedOrder.customerId,
      updatedOrder.restaurantId,
      updatedOrder.id,
      {
        orderId: updatedOrder.id,
        status: updatedOrder.status,
        updatedAt: updatedOrder.updatedAt,
      },
    );

    return updatedOrder;
  }

  async cancel(id: string, customerId: string): Promise<Order> {
    const order = await this.findOne(id);

    if (order.customerId !== customerId) {
      throw new ForbiddenException('You are not allowed to cancel this order');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order can only be cancelled when status is "pending", current status is "${order.status}"`,
      );
    }

    order.status = OrderStatus.CANCELLED;
    await this.orderRepository.save(order);

    // Notify the customer about the cancellation
    await this.notificationsProducer.enqueueOrderStatusChange(
      order.id,
      order.customerId,
      OrderStatus.CANCELLED,
    );

    const cancelledOrder = await this.findOne(id);

    // Real-time: notify all parties about the cancellation
    this.eventsService.emitOrderUpdate(
      cancelledOrder.customerId,
      cancelledOrder.restaurantId,
      cancelledOrder.id,
      {
        orderId: cancelledOrder.id,
        status: cancelledOrder.status,
        updatedAt: cancelledOrder.updatedAt,
      },
    );

    return cancelledOrder;
  }
}
