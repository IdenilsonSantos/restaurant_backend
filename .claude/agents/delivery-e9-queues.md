---
name: delivery-e9-queues
description: Etapa 9 do sistema de delivery — implementa filas assíncronas com BullMQ para matching de entregadores e notificações, com retry e backoff exponencial. Depende das Etapas 7 e 8.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 9 — Filas com BullMQ** do sistema de delivery.

## Pré-requisito
PRs das Etapas 7 e 8 mergeados na `main`.

## Dependências a instalar
```bash
npm install bullmq @nestjs/bullmq
```

## O que você deve criar

### QueueModule (`src/modules/queue/`)

**queue.module.ts** — configura BullMQ com Redis:
```typescript
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
  ],
  exports: [BullModule],
})
export class QueueModule {}
```

---

### Fila: delivery-matching

**Constantes (`src/modules/queue/constants/queue.constants.ts`):**
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
} as const;
```

**Producer (`src/modules/queue/producers/delivery-matching.producer.ts`):**
```typescript
@Injectable()
export class DeliveryMatchingProducer {
  constructor(
    @InjectQueue(QUEUES.DELIVERY_MATCHING) private queue: Queue,
  ) {}

  async enqueueMatching(deliveryId: string, restaurantLat: number, restaurantLng: number, attempt = 1) {
    await this.queue.add(JOBS.MATCH_DRIVER, {
      deliveryId, restaurantLat, restaurantLng, attempt,
    }, {
      delay: attempt > 1 ? attempt * 5000 : 0, // delay crescente no retry manual
      jobId: `match-${deliveryId}-${attempt}`, // evita duplicatas
    });
  }
}
```

**Processor (`src/modules/queue/processors/delivery-matching.processor.ts`):**
```typescript
@Processor(QUEUES.DELIVERY_MATCHING)
export class DeliveryMatchingProcessor extends WorkerHost {
  constructor(
    private matchingService: MatchingService,
    private notificationsProducer: NotificationsProducer,
    private producer: DeliveryMatchingProducer,
  ) { super(); }

  async process(job: Job) {
    const { deliveryId, restaurantLat, restaurantLng, attempt } = job.data;

    const driverId = await this.matchingService.findBestDriver(restaurantLat, restaurantLng);

    if (!driverId) {
      if (attempt < 5) {
        // Re-enfileira com delay maior
        await this.producer.enqueueMatching(deliveryId, restaurantLat, restaurantLng, attempt + 1);
      }
      // Após 5 tentativas: notificar restaurante de indisponibilidade
      return;
    }

    await this.matchingService.assignDriver(deliveryId, driverId);
    await this.notificationsProducer.enqueueDeliveryRequest(deliveryId, driverId);
  }
}
```

---

### Fila: notifications

**Producer (`src/modules/queue/producers/notifications.producer.ts`):**
```typescript
@Injectable()
export class NotificationsProducer {
  constructor(
    @InjectQueue(QUEUES.NOTIFICATIONS) private queue: Queue,
  ) {}

  async enqueueOrderStatusChange(orderId: string, customerId: string, status: OrderStatus) {
    await this.queue.add(JOBS.NOTIFY_ORDER_STATUS, { orderId, customerId, status });
  }

  async enqueueDeliveryRequest(deliveryId: string, driverId: string) {
    await this.queue.add(JOBS.NOTIFY_DELIVERY_REQUEST, { deliveryId, driverId });
  }
}
```

**Processor (`src/modules/queue/processors/notifications.processor.ts`):**
```typescript
@Processor(QUEUES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  async process(job: Job) {
    switch (job.name) {
      case JOBS.NOTIFY_ORDER_STATUS:
        this.logger.log(`Notifying customer ${job.data.customerId}: order ${job.data.orderId} → ${job.data.status}`);
        // Em prod: push notification, email, SMS
        break;
      case JOBS.NOTIFY_DELIVERY_REQUEST:
        this.logger.log(`Notifying driver ${job.data.driverId}: delivery ${job.data.deliveryId}`);
        break;
    }
  }
}
```

---

### Integrar producers nos módulos existentes

- `DeliveryService.create`: após criar entrega, chamar `DeliveryMatchingProducer.enqueueMatching`
- `OrderService.updateStatus`: após mudança de status, chamar `NotificationsProducer.enqueueOrderStatusChange`

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e9-bullmq-queues`
3. Criar todos os arquivos
4. `git add src/modules/queue`
5. `git commit -m "feat: add BullMQ queues for delivery matching and notifications"`
6. `git push origin feat/e9-bullmq-queues`
7. `gh pr create --title "feat: E9 - BullMQ queues" --base main --body "## O que foi feito\n- QueueModule com BullMQ + Redis\n- Fila delivery-matching: producer + processor com retry manual (até 5 tentativas)\n- Fila notifications: producer + processor para status de pedido e solicitação de entrega\n- Backoff exponencial configurado como padrão\n- Producers integrados em DeliveryService e OrderService\n\n## Depende de\nPRs E7 e E8 mergeados"`

## Regras
- Usar `jobId` único para evitar jobs duplicados na fila de matching
- Retry automático do BullMQ para erros de sistema (ex: Redis down)
- Retry manual com delay crescente para "nenhum driver disponível" (lógica de negócio)
- Processors não devem lançar exceções desnecessariamente — logar e continuar
