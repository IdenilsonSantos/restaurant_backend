---
name: e1-setup
description: Etapa 1 — inicializa o projeto NestJS, configura estrutura de pastas, variáveis de ambiente, Dockerfile.dev, docker-compose para desenvolvimento e health check. Use para começar um projeto do zero.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 1 — Inicialização do Projeto + Docker Dev**.

## Pré-requisito
Nenhum — esta é a primeira etapa.

## Dependências a instalar
```bash
npm install @nestjs/config @nestjs/terminus class-validator class-transformer joi
```

## O que você deve criar

### 1. Estrutura de pastas
```
src/
  modules/
  config/
  common/
    filters/
    interceptors/
    decorators/
    guards/
    enums/
    dto/
    interfaces/
  database/
    migrations/
```

### 2. Variáveis de ambiente

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

`src/config/env.validation.ts` — schema Joi que valida todas as variáveis acima ao iniciar.

### 3. ConfigModule global
Em `src/app.module.ts`, configurar `ConfigModule.forRoot({ isGlobal: true, validationSchema })`.

### 4. main.ts
```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');  // IMPORTANTE: usar api/v1, não api

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application running on http://localhost:${port}`);
}
```

> **ATENÇÃO**: O prefixo global DEVE ser `api/v1`. Todos os endpoints ficam em `http://localhost:3000/api/v1/...`.

### 5. Health Check
`src/modules/health/health.module.ts` + `health.controller.ts`:
- `GET /health` — retorna `{ status: 'ok', timestamp: new Date().toISOString() }`

### 6. Dockerfile.dev
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "start:dev"]
```

### 7. docker-compose.yml (dev)
```yaml
version: '3.9'
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
    env_file: .env
    depends_on:
      - postgres
      - redis
    networks:
      - app-network

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: delivery
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - app-network

networks:
  app-network:

volumes:
  postgres_data:
  redis_data:
```

### 8. .gitignore
Garantir inclusão de: `node_modules`, `dist`, `.env`, `.env.*`, `!.env.example`, `coverage`, `logs/`

## Fluxo de commit e PR

```bash
git checkout -b feat/e1-project-setup
# nunca adicionar .env
git add src/ Dockerfile.dev docker-compose.yml .env.example .gitignore package*.json
git commit -m "feat: initialize NestJS project with Docker dev environment"
git push origin feat/e1-project-setup
gh pr create \
  --title "feat: E1 - Project setup + Docker dev" \
  --base main \
  --body "## O que foi feito
- Projeto NestJS inicializado com prefixo global api/v1
- Estrutura de pastas src/modules, src/config, src/common
- ConfigModule global com validação Joi
- Health check em GET /api/v1/health
- Dockerfile.dev com hot reload
- docker-compose.yml com PostgreSQL 16 e Redis 7

## Como testar
\`\`\`bash
docker compose up
curl http://localhost:3000/api/v1/health
\`\`\`"
```

## Regras
- **Prefixo SEMPRE `api/v1`** — nunca apenas `api`
- Não implementar auth, módulos de negócio ou banco — escopo desta etapa é infraestrutura
- Código real e funcional, sem pseudocódigo
- `.env` nunca commitado
