---
name: e9-queues
description: Etapa 9 — implementa filas assíncronas com BullMQ para matching de entregadores e notificações, com retry e backoff exponencial. Depende das E7 e E8.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 9 — Filas com BullMQ.

## Pré-requisito
PRs E7 e E8 mergeados.

## Dependências
```bash
npm install bullmq @nestjs/bullmq
```

## QueueModule (`src/modules/queue/`)

```typescript
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
    BullModule.registerQueue({ name: 'delivery-matching' }, { name: 'notifications' }),
    DeliveryModule,
    EventsModule,
  ],
  providers: [DeliveryMatchingProducer, DeliveryMatchingProcessor, NotificationsProducer, NotificationsProcessor],
  exports: [BullModule, DeliveryMatchingProducer, NotificationsProducer],
})
export class QueueModule {}
```

## Constantes (`src/modules/queue/constants/queue.constants.ts`)

```typescript
export const QUEUES = { DELIVERY_MATCHING: 'delivery-matching', NOTIFICATIONS: 'notifications' } as const;
export const JOBS = {
  MATCH_DRIVER: 'match-driver',
  NOTIFY_ORDER_STATUS: 'notify-order-status',
  NOTIFY_DELIVERY_REQUEST: 'notify-delivery-request',
  NOTIFY_NO_DRIVER: 'notify-no-driver',
} as const;
```

---

## Fila: delivery-matching

**Producer** — `enqueueMatching(deliveryId, lat, lng, attempt=1)`:
- `delay = attempt > 1 ? attempt * 5000 : 0` (0s, 10s, 15s, 20s, 25s)
- `jobId = match-{deliveryId}-{attempt}` — evita duplicatas

**Processor:**
```typescript
@Processor(QUEUES.DELIVERY_MATCHING)
export class DeliveryMatchingProcessor extends WorkerHost {
  private readonly MAX_ATTEMPTS = 5;

  async process(job: Job): Promise<void> {
    const { deliveryId, restaurantLat, restaurantLng, attempt } = job.data;

    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery || delivery.status !== DeliveryStatus.WAITING) return;

    const driverId = await this.matchingService.findBestDriver(restaurantLat, restaurantLng);

    if (!driverId) {
      if (attempt < this.MAX_ATTEMPTS) {
        await this.producer.enqueueMatching(deliveryId, restaurantLat, restaurantLng, attempt + 1);
      } else {
        await this.notificationsProducer.enqueueNoDriver(deliveryId, delivery.order.restaurantId);
      }
      return;
    }

    await this.matchingService.assignDriver(deliveryId, driverId);
    await this.notificationsProducer.enqueueDeliveryRequest(deliveryId, driverId);
  }
}
```

---

## Fila: notifications

**Producer** — métodos:
- `enqueueOrderStatusChange(orderId, customerId, status)` — job `NOTIFY_ORDER_STATUS`
- `enqueueDeliveryRequest(deliveryId, driverId)` — job `NOTIFY_DELIVERY_REQUEST`
- `enqueueNoDriver(deliveryId, restaurantId)` — job `NOTIFY_NO_DRIVER`

**Processor:**
```typescript
@Processor(QUEUES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly eventsService: EventsService) { super(); }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOBS.NOTIFY_ORDER_STATUS:
        // Em produção: push notification, email ou SMS
        break;
      case JOBS.NOTIFY_DELIVERY_REQUEST:
        this.eventsService.emitDeliveryRequest(job.data.driverId, { deliveryId: job.data.deliveryId });
        break;
      case JOBS.NOTIFY_NO_DRIVER:
        // Em produção: notificar restaurante
        break;
    }
  }
}
```

---

## Integrações necessárias

- **DeliveryService.create**: ao não encontrar driver, chamar `deliveryMatchingProducer.enqueueMatching(...)`
- **OrderService.updateStatus**: após salvar, chamar `notificationsProducer.enqueueOrderStatusChange(...)`

## Commit
```bash
git checkout -b feat/e9-bullmq-queues
git add src/modules/queue
git commit -m "feat: add BullMQ queues for delivery matching and notifications"
```

## Regras
- `jobId = match-{deliveryId}-{attempt}` — previne jobs duplicados por `deliveryId+attempt`
- Retry **automático** BullMQ (3×, exponential) para erros de infra
- Retry **manual** com delay crescente para "nenhum driver" (lógica de negócio)
- Após 5 tentativas manuais sem driver: notificar restaurante e parar
- Processors: logar e continuar — nunca lançar exceções desnecessárias
