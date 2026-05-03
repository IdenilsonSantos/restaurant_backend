---
name: e11-observability
description: Etapa 11 — implementa logs estruturados com Winston, filtro global de exceções, ValidationPipe global, RequestLoggerInterceptor e health checks para DB e Redis. Depende de todas as etapas anteriores (E1-E10).
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 11 — Observabilidade**.

## Pré-requisito
PRs das E1 a E10 mergeados na `main`.

## Estado atual do código
O `src/main.ts` atual usa prefixo `api` (sem `/v1`) e não tem ValidationPipe nem filtro de exceções.
Esta etapa **corrige o prefixo** e adiciona todos os componentes de observabilidade.

## Dependências a instalar
```bash
npm install @nestjs/terminus winston nest-winston
```

## O que você deve criar/corrigir

### 1. Corrigir `src/main.ts`

Substituir completamente o `main.ts` pelo seguinte:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { RequestLoggerInterceptor } from './common/interceptors/request-logger.interceptor';
import { loggerConfig } from './config/logger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: loggerConfig });

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');  // CORRETO: api/v1, não api

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggerInterceptor());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
```

> **ATENÇÃO**: Se o main.ts existente usa `app.setGlobalPrefix('api')`, esta etapa DEVE corrigir para `'api/v1'`.

---

### 2. Logger estruturado

`src/config/logger.config.ts`:
```typescript
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

export const loggerConfig = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${context ?? 'App'}] ${level}: ${message} ${metaStr}`;
        }),
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  ],
});
```

Adicionar `logs/` ao `.gitignore`.

---

### 3. RequestLoggerInterceptor

`src/common/interceptors/request-logger.interceptor.ts`:
```typescript
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, url, ip } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        const ms = Date.now() - start;
        this.logger.log(`${method} ${url} ${res.statusCode} ${ms}ms - ${ip}`);
      }),
    );
  }
}
```

---

### 4. GlobalExceptionFilter

`src/common/filters/http-exception.filter.ts`:
```typescript
import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException,
  HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error';

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
```

---

### 5. Health Checks aprimorados

Atualizar `src/modules/health/health.module.ts` para importar `TerminusModule` e `TypeOrmModule`.

Atualizar `src/modules/health/health.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }
}
```

> O `MicroserviceHealthIndicator` para Redis requer configuração de transporte que pode variar.
> Manter check simples de DB por enquanto; adicionar Redis check se o `RedisService` expor um método `ping()`.

---

### 6. ValidationPipe global — detalhes

O `ValidationPipe` com `whitelist: true` remove campos não declarados nos DTOs automaticamente.
Com `transform: true` + `enableImplicitConversion: true`, strings numéricas em query params são convertidas para `number` automaticamente — necessário para `PaginationDto`, `NearbyRestaurantDto`, etc.

`forbidNonWhitelisted: true` retorna `400 Bad Request` se campos extras forem enviados no body.

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e11-observability
git add src/main.ts src/config/logger.config.ts src/common/interceptors src/common/filters src/modules/health
git commit -m "feat: add structured logging, global exception filter, ValidationPipe and fix api/v1 prefix"
git push origin feat/e11-observability
gh pr create \
  --title "feat: E11 - Observability + fix api/v1 prefix" \
  --base main \
  --body "## O que foi feito
- Corrigido prefixo global: api → api/v1
- Winston logger estruturado (console + arquivos logs/)
- RequestLoggerInterceptor: log de todas as requests (método, url, status, ms)
- GlobalExceptionFilter: respostas de erro padronizadas { statusCode, timestamp, path, message }
- ValidationPipe global com whitelist, forbidNonWhitelisted, transform
- Health check com TypeORM pingCheck

## Depende de
Todos os PRs anteriores mergeados

## Breaking change
O prefixo muda de /api para /api/v1 — atualizar qualquer client que use /api"
```

## Regras
- **NUNCA** logar dados sensíveis (passwords, tokens, CPF, cartão)
- Stack trace apenas em erros 5xx — erros 4xx são esperados, não logar stack
- Resposta de erro sempre: `{ statusCode, timestamp, path, message }`
- `logs/` deve estar no `.gitignore`
