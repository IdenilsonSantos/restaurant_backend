---
name: e9-queues
description: Etapa 9 — implementa filas assíncronas com BullMQ para matching de entregadores e notificações, com retry e backoff exponencial. Depende das E7 e E8.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 9 — Filas com BullMQ**.

## Pré-requisito
PRs das E7 e E8 mergeados na `main`.

## Dependências a instalar
```bash
npm install bullmq @nestjs/bullmq
```

## O que você deve criar

### QueueModule (`src/modules/queue/`)

**queue.module.ts**:
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
    BullModule.registerQueue(
      { name: 'delivery-matching' },
      { name: 'notifications' },
    ),
    DeliveryModule,   // para MatchingService no processor
    EventsModule,     // para EventsService no notifications processor
  ],
  providers: [
    DeliveryMatchingProducer,
    DeliveryMatchingProcessor,
    NotificationsProducer,
    NotificationsProcessor,
  ],
  exports: [BullModule, DeliveryMatchingProducer, NotificationsProducer],
})
export class QueueModule {}
```

---

### Constantes

`src/modules/queue/constants/queue.constants.ts`:
```typescript
export const QUEUES = {
  DELIVERY_MATCHING: 'delivery-matching',
  NOTIFICATIONS: 'notifications',
} as const;

export const JOBS = {
  MATCH_DRIVER: 'match-driver',
  RETRY_MATCHING: 'retry-matching',
  NOTIFY_ORDER_STATUS: 'notify-order-status',
  NOTIFY_DELIVERY_REQUEST: 'notify-delivery-request',
  NOTIFY_NO_DRIVER: 'notify-no-driver',
} as const;
```

---

### Fila: delivery-matching

**Producer** (`src/modules/queue/producers/delivery-matching.producer.ts`):
```typescript
@Injectable()
export class DeliveryMatchingProducer {
  constructor(@InjectQueue(QUEUES.DELIVERY_MATCHING) private queue: Queue) {}

  async enqueueMatching(deliveryId: string, restaurantLat: number, restaurantLng: number, attempt = 1) {
    const delay = attempt > 1 ? attempt * 5_000 : 0; // 0s, 10s, 15s, 20s, 25s
    await this.queue.add(
      JOBS.MATCH_DRIVER,
      { deliveryId, restaurantLat, restaurantLng, attempt },
      {
        delay,
        jobId: `match-${deliveryId}-${attempt}`, // evita duplicatas por deliveryId+attempt
      },
    );
  }
}
```

**Processor** (`src/modules/queue/processors/delivery-matching.processor.ts`):
```typescript
@Processor(QUEUES.DELIVERY_MATCHING)
export class DeliveryMatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryMatchingProcessor.name);
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly matchingService: MatchingService,
    private readonly notificationsProducer: NotificationsProducer,
    private readonly producer: DeliveryMatchingProducer,
    private readonly eventsService: EventsService,
    @InjectRepository(Delivery) private readonly deliveryRepo: Repository<Delivery>,
  ) { super(); }

  async process(job: Job): Promise<void> {
    const { deliveryId, restaurantLat, restaurantLng, attempt } = job.data;
    this.logger.log(`Matching attempt ${attempt}/${this.MAX_ATTEMPTS} for delivery ${deliveryId}`);

    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
      relations: ['order', 'order.restaurant'],
    });

    if (!delivery || delivery.status !== DeliveryStatus.WAITING) {
      this.logger.warn(`Delivery ${deliveryId} not in waiting state, skipping`);
      return;
    }

    const driverId = await this.matchingService.findBestDriver(restaurantLat, restaurantLng);

    if (!driverId) {
      if (attempt < this.MAX_ATTEMPTS) {
        await this.producer.enqueueMatching(deliveryId, restaurantLat, restaurantLng, attempt + 1);
        this.logger.warn(`No driver found, retrying attempt ${attempt + 1}`);
      } else {
        // Após 5 tentativas: notificar restaurante
        await this.notificationsProducer.enqueueNoDriver(deliveryId, delivery.order.restaurantId);
        this.logger.error(`No driver found after ${this.MAX_ATTEMPTS} attempts for delivery ${deliveryId}`);
      }
      return;
    }

    await this.matchingService.assignDriver(deliveryId, driverId);
    await this.notificationsProducer.enqueueDeliveryRequest(deliveryId, driverId);
  }
}
```

---

### Fila: notifications

**Producer** (`src/modules/queue/producers/notifications.producer.ts`):
```typescript
@Injectable()
export class NotificationsProducer {
  constructor(@InjectQueue(QUEUES.NOTIFICATIONS) private queue: Queue) {}

  async enqueueOrderStatusChange(orderId: string, customerId: string, status: OrderStatus) {
    await this.queue.add(JOBS.NOTIFY_ORDER_STATUS, { orderId, customerId, status });
  }

  async enqueueDeliveryRequest(deliveryId: string, driverId: string) {
    await this.queue.add(JOBS.NOTIFY_DELIVERY_REQUEST, { deliveryId, driverId });
  }

  async enqueueNoDriver(deliveryId: string, restaurantId: string) {
    await this.queue.add(JOBS.NOTIFY_NO_DRIVER, { deliveryId, restaurantId });
  }
}
```

**Processor** (`src/modules/queue/processors/notifications.processor.ts`):
```typescript
@Processor(QUEUES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly eventsService: EventsService) { super(); }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOBS.NOTIFY_ORDER_STATUS:
        this.logger.log(`Order ${job.data.orderId} → ${job.data.status} (customer: ${job.data.customerId})`);
        // Em produção: enviar push notification, email ou SMS
        break;

      case JOBS.NOTIFY_DELIVERY_REQUEST:
        this.eventsService.emitDeliveryRequest(job.data.driverId, {
          deliveryId: job.data.deliveryId,
        });
        this.logger.log(`Delivery request sent to driver ${job.data.driverId}`);
        break;

      case JOBS.NOTIFY_NO_DRIVER:
        this.logger.error(`No driver available for delivery ${job.data.deliveryId}, notifying restaurant ${job.data.restaurantId}`);
        // Em produção: notificar restaurante via Socket.IO ou push
        break;
    }
  }
}
```

---

### Integrar producers nos módulos existentes

1. **DeliveryService.create**: após criar entrega sem driver, chamar:
   ```typescript
   await this.deliveryMatchingProducer.enqueueMatching(delivery.id, restaurant.latitude, restaurant.longitude);
   ```

2. **OrderService.updateStatus**: após salvar mudança de status, chamar:
   ```typescript
   await this.notificationsProducer.enqueueOrderStatusChange(order.id, order.customerId, dto.status);
   ```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e9-bullmq-queues
git add src/modules/queue
git commit -m "feat: add BullMQ queues for delivery matching and notifications"
git push origin feat/e9-bullmq-queues
gh pr create \
  --title "feat: E9 - BullMQ queues" \
  --base main \
  --body "## O que foi feito
- QueueModule com BullMQ + Redis connection
- Fila delivery-matching: retry manual até 5 tentativas (delay crescente: attempt×5s)
- Fila notifications: status de pedido, solicitação de entrega, sem-motorista
- Backoff exponencial padrão (3 tentativas para erros de sistema)
- NotificationsProcessor emite evento Socket.IO para delivery:request
- Producers integrados em DeliveryService e OrderService

## Depende de
PRs E7 e E8 mergeados"
```

## Regras
- `jobId` único por `deliveryId + attempt` — evita duplicatas no matching
- Retry **automático** do BullMQ (3×, exponential) para erros de infra (Redis down, crash)
- Retry **manual** com delay crescente para "nenhum driver disponível" (lógica de negócio)
- Processors não devem lançar exceções desnecessárias — logar e continuar
- Após 5 tentativas manuais sem driver: notificar restaurante e parar
