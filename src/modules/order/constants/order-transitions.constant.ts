import { OrderStatus } from '../../../common/enums/order-status.enum';

export const ORDER_TRANSITIONS: Record<
  OrderStatus,
  { next: OrderStatus; allowedRoles: string[] }[]
> = {
  [OrderStatus.PENDING]: [
    { next: OrderStatus.CONFIRMED, allowedRoles: ['restaurant_owner'] },
    {
      next: OrderStatus.CANCELLED,
      allowedRoles: ['customer', 'restaurant_owner'],
    },
  ],
  [OrderStatus.CONFIRMED]: [
    { next: OrderStatus.PREPARING, allowedRoles: ['restaurant_owner'] },
  ],
  [OrderStatus.PREPARING]: [
    { next: OrderStatus.READY, allowedRoles: ['restaurant_owner'] },
  ],
  [OrderStatus.READY]: [
    { next: OrderStatus.PICKED_UP, allowedRoles: ['driver'] },
  ],
  [OrderStatus.PICKED_UP]: [
    { next: OrderStatus.DELIVERED, allowedRoles: ['driver'] },
  ],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};
