---
name: e13-docker-prod
description: Etapa 13 — Dockerfile multi-stage para produção, docker-compose.prod.yml com healthchecks e scripts de deploy. Depende da E12 (testes passando).
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 13 — Docker Produção.

## Pré-requisito
PRs E1–E12 mergeados e testes passando.

## Dockerfile (multi-stage)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN mkdir -p logs && chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
CMD ["node", "dist/main"]
```

## .dockerignore

```
node_modules
dist
coverage
logs
.env
.env.*
!.env.example
.git
*.md
docker-compose*.yml
Dockerfile*
.eslintrc*
.prettierrc*
tsconfig*.json
test/
src/**/*.spec.ts
src/**/*.e2e-spec.ts
```

## docker-compose.prod.yml

```yaml
version: '3.9'
services:
  app:
    build: { context: ., dockerfile: Dockerfile, target: production }
    image: delivery-api:latest
    restart: always
    ports: ["3000:3000"]
    env_file: .env.prod
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    networks: [app-network]
    deploy:
      resources:
        limits: { memory: 512M, cpus: '0.5' }

  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes: [postgres_data:/var/lib/postgresql/data]
    networks: [app-network]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes: [redis_data:/data]
    networks: [app-network]
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  app-network:
    driver: bridge
volumes:
  postgres_data:
  redis_data:
```

## .env.prod.example

```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://delivery:strong-password@postgres:5432/delivery
POSTGRES_USER=delivery
POSTGRES_PASSWORD=strong-password-here
POSTGRES_DB=delivery
REDIS_URL=redis://:strong-redis-password@redis:6379
REDIS_PASSWORD=strong-redis-password
JWT_SECRET=very-long-random-secret-min-64-chars
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://yourdomain.com
```

## Scripts no package.json

Adicionar:
```json
"docker:build":       "docker build -t delivery-api:latest .",
"docker:prod:up":     "docker compose -f docker-compose.prod.yml up -d",
"docker:prod:down":   "docker compose -f docker-compose.prod.yml down",
"docker:prod:logs":   "docker compose -f docker-compose.prod.yml logs -f app"
```

## Commit
```bash
git checkout -b feat/e13-docker-production
git add Dockerfile .dockerignore docker-compose.prod.yml .env.prod.example
git commit -m "feat: add multi-stage Dockerfile and production docker-compose"
```

## Regras
- `.env.prod` nunca commitado — apenas `.env.prod.example`
- Stage production: `npm ci --omit=dev` (sem devDependencies)
- Nunca rodar como root: `USER appuser`
- HEALTHCHECK aponta para `/api/v1/health`
