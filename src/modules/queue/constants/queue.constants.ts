export const QUEUES = {
  DELIVERY_MATCHING: 'delivery-matching',
  NOTIFICATIONS: 'notifications',
} as const;

export const JOBS = {
  MATCH_DRIVER: 'match-driver',
  RETRY_MATCHING: 'retry-matching',
  NOTIFY_ORDER_STATUS: 'notify-order-status',
  NOTIFY_DELIVERY_REQUEST: 'notify-delivery-request',
} as const;
