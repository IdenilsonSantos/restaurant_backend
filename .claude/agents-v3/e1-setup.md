---
name: e1-setup
description: Etapa 1 — inicializa o projeto NestJS, configura estrutura de pastas, variáveis de ambiente, Dockerfile.dev, docker-compose para desenvolvimento e health check.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 1 — Inicialização do Projeto + Docker Dev.

## Pré-requisito
Nenhum.

## Dependências
```bash
npm install @nestjs/config @nestjs/terminus class-validator class-transformer joi
```

## Estrutura de pastas
```
src/
  modules/
  config/
  common/filters/ interceptors/ decorators/ guards/ enums/ dto/ interfaces/
  database/migrations/
```

## Variáveis de ambiente

`.env.example`:
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/delivery
REDIS_URL=redis://localhost:6379
JWT_SECRET=changeme
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
```

`src/config/env.validation.ts` — schema Joi que valida todas as variáveis ao iniciar (app não sobe com variável faltando).

## ConfigModule

`src/app.module.ts`: `ConfigModule.forRoot({ isGlobal: true, validationSchema })`.

## main.ts

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');  // NUNCA apenas 'api'
  await app.listen(process.env.PORT ?? 3000);
}
```

## Health Check

`src/modules/health/` — `GET /health` retorna `{ status: 'ok', timestamp: new Date().toISOString() }`.

## Dockerfile.dev

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "start:dev"]
```

## docker-compose.yml (dev)

```yaml
version: '3.9'
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports: ["3000:3000"]
    volumes: [".:/app", "/app/node_modules"]
    env_file: .env
    depends_on: [postgres, redis]
    networks: [app-network]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: delivery
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]
    networks: [app-network]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis_data:/data]
    networks: [app-network]

networks:
  app-network:
volumes:
  postgres_data:
  redis_data:
```

## .gitignore
Incluir: `node_modules`, `dist`, `.env`, `.env.*` (exceto `!.env.example`), `coverage`, `logs/`.

## Commit
```bash
git checkout -b feat/e1-project-setup
git add src/ Dockerfile.dev docker-compose.yml .env.example .gitignore package*.json
git commit -m "feat: initialize NestJS project with Docker dev environment"
```

## Regras
- Prefixo **sempre** `api/v1`
- Não implementar auth, módulos de negócio ou banco nesta etapa
- `.env` nunca commitado
