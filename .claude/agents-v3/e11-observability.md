---
name: e11-observability
description: Etapa 11 — logs estruturados com Winston, GlobalExceptionFilter, ValidationPipe global, RequestLoggerInterceptor e health checks. Também corrige o prefixo para api/v1. Depende de E1-E10.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 11 — Observabilidade.

## Pré-requisito
PRs E1–E10 mergeados.

## Dependências
```bash
npm install @nestjs/terminus winston nest-winston
```

## 1. main.ts (substituição completa)

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

  app.setGlobalPrefix('api/v1');  // CORRIGIDO: era 'api', deve ser 'api/v1'

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggerInterceptor());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

---

## 2. Logger estruturado

`src/config/logger.config.ts`:
```typescript
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
      filename: 'logs/error.log', level: 'error',
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

## 3. GlobalExceptionFilter

```typescript
// src/common/filters/http-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException
      ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException
      ? exception.getResponse() : 'Internal server error';

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception));
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

## 4. RequestLoggerInterceptor

`src/common/interceptors/request-logger.interceptor.ts` — interceptor que:
1. Captura `method`, `url`, `ip` e `Date.now()` antes do handler
2. Usa `tap()` no observable para logar `METHOD URL statusCode Xms - ip` ao concluir

---

## 5. Health Checks

Atualizar `HealthModule` para importar `TerminusModule` e `TypeOrmModule`.

`HealthController.check()` → `health.check([() => this.db.pingCheck('database')])` com `@HealthCheck()`.

Adicionar `ping()` ao `RedisService` se quiser check de Redis (`GET ping`).

---

## Commit
```bash
git checkout -b feat/e11-observability
git add src/main.ts src/config/logger.config.ts src/common/interceptors src/common/filters src/modules/health
git commit -m "feat: add structured logging, global exception filter, ValidationPipe and fix api/v1 prefix"
```

## Regras
- **Nunca** logar passwords, tokens JWT, CPF ou número de cartão
- Stack trace apenas em erros 5xx — 4xx são esperados
- Resposta de erro: `{ statusCode, timestamp, path, message }`
- `logs/` no `.gitignore`
- `ValidationPipe` com `whitelist + transform + forbidNonWhitelisted` — obrigatório para query params de paginação e busca funcionarem
