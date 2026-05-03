---
name: e13-docker-prod
description: Etapa 13 — cria Dockerfile multi-stage para produção, docker-compose.prod.yml com healthchecks, .dockerignore otimizado e scripts de deploy. Depende da E12 (testes passando).
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 13 — Docker Produção**.

## Pré-requisito
PRs das E1 a E12 mergeados na `main` e testes passando.

## O que você deve criar

### 1. Dockerfile (multi-stage)

```dockerfile
# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────────────────────
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

---

### 2. .dockerignore
```
node_modules
dist
coverage
logs
.env
.env.*
!.env.example
.git
.gitignore
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

---

### 3. docker-compose.prod.yml
```yaml
version: '3.9'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    image: delivery-api:latest
    restart: always
    ports:
      - "3000:3000"
    env_file:
      - .env.prod
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - app-network
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'

  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - app-network
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

---

### 4. .env.prod.example
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

---

### 5. Scripts no package.json

Adicionar/verificar:
```json
{
  "scripts": {
    "build": "nest build",
    "start:prod": "node dist/main",
    "migration:run:prod": "node -e \"require('./dist/config/data-source').AppDataSource.initialize().then(ds => ds.runMigrations()).then(() => process.exit(0))\"",
    "docker:build": "docker build -t delivery-api:latest .",
    "docker:prod:up": "docker compose -f docker-compose.prod.yml up -d",
    "docker:prod:down": "docker compose -f docker-compose.prod.yml down",
    "docker:prod:logs": "docker compose -f docker-compose.prod.yml logs -f app",
    "docker:prod:migrate": "docker compose -f docker-compose.prod.yml exec app node dist/main migration:run"
  }
}
```

---

### 6. Validação local
```bash
# Build da imagem
docker build -t delivery-api:latest .

# Verificar tamanho (deve ser < 300MB)
docker images delivery-api

# Testar com compose de prod
cp .env.prod.example .env.prod
# editar .env.prod com valores reais
docker compose -f docker-compose.prod.yml up -d
curl http://localhost:3000/api/v1/health
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e13-docker-production
git add Dockerfile .dockerignore docker-compose.prod.yml .env.prod.example
git commit -m "feat: add multi-stage Dockerfile and production docker-compose"
git push origin feat/e13-docker-production
gh pr create \
  --title "feat: E13 - Docker production" \
  --base main \
  --body "## O que foi feito
- Dockerfile multi-stage: builder (npm ci completo) + production (apenas deps prod)
- Imagem final com node:20-alpine — tamanho mínimo
- Usuário não-root (appuser) por segurança
- HEALTHCHECK embutido na imagem (GET /api/v1/health)
- docker-compose.prod.yml com healthchecks, restart:always e resource limits
- .dockerignore otimizado — exclui testes, .env, devDeps
- .env.prod.example documentado

## Depende de
PR E12 mergeado (testes passando)

## Como testar
\`\`\`bash
docker build -t delivery-api:latest .
docker compose -f docker-compose.prod.yml up -d
curl http://localhost:3000/api/v1/health
\`\`\`"
```

## Regras
- **NUNCA** incluir `.env` ou `.env.prod` em commits — apenas `.env.*.example`
- Imagem final não deve ter `devDependencies` (`npm ci --omit=dev`)
- Nunca rodar como root — `USER appuser`
- HEALTHCHECK aponta para `/api/v1/health` — consistente com o prefixo da aplicação
