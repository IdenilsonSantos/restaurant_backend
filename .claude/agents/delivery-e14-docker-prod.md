---
name: delivery-e14-docker-prod
description: Etapa 14 do sistema de delivery — cria Dockerfile multi-stage para produção, docker-compose.prod.yml, .dockerignore otimizado e scripts de deploy. Depende da Etapa 13 (testes passando).
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 14 — Docker Produção** do sistema de delivery.

## Pré-requisito
PRs das Etapas 1 a 13 mergeados na `main` e testes passando.

## O que você deve criar

### 1. Dockerfile (multi-stage)

```dockerfile
# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production=false

COPY . .
RUN npm run build

# ---- Stage 2: Production ----
FROM node:20-alpine AS production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
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
DATABASE_URL=postgresql://user:pass@postgres:5432/delivery
POSTGRES_USER=delivery
POSTGRES_PASSWORD=strong-password-here
POSTGRES_DB=delivery
REDIS_URL=redis://:strong-redis-password@redis:6379
REDIS_PASSWORD=strong-redis-password
JWT_SECRET=very-long-random-secret-here
JWT_EXPIRES_IN=7d
```

---

### 5. Scripts no package.json

Adicionar/verificar:
```json
{
  "scripts": {
    "build": "nest build",
    "start:prod": "node dist/main",
    "migration:run": "typeorm migration:run -d dist/config/data-source.js",
    "migration:revert": "typeorm migration:revert -d dist/config/data-source.js",
    "docker:build": "docker build -t delivery-api:latest .",
    "docker:prod:up": "docker compose -f docker-compose.prod.yml up -d",
    "docker:prod:down": "docker compose -f docker-compose.prod.yml down",
    "docker:prod:logs": "docker compose -f docker-compose.prod.yml logs -f app"
  }
}
```

---

### 6. Validação

Testar que o build funciona:
```bash
docker build -t delivery-api:latest .
docker images delivery-api
```

Verificar tamanho da imagem (deve ser < 300MB idealmente).

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e14-docker-production`
3. Criar todos os arquivos
4. `git add Dockerfile .dockerignore docker-compose.prod.yml .env.prod.example`
5. `git commit -m "feat: add multi-stage Dockerfile and production docker-compose"`
6. `git push origin feat/e14-docker-production`
7. `gh pr create --title "feat: E14 - Docker production" --base main --body "## O que foi feito\n- Dockerfile multi-stage (builder + production)\n- Imagem final mínima com node:20-alpine\n- Usuário não-root (appuser)\n- HEALTHCHECK embutido na imagem\n- docker-compose.prod.yml com healthchecks, restart e resource limits\n- .dockerignore otimizado\n- .env.prod.example documentado\n\n## Depende de\nPR E13 mergeado (testes passando)\n\n## Como testar\n\`\`\`bash\ndocker build -t delivery-api:latest .\ndocker compose -f docker-compose.prod.yml up -d\ncurl http://localhost:3000/api/v1/health\n\`\`\`"`

## Regras
- NUNCA incluir .env nos arquivos commitados
- Imagem final não deve conter devDependencies
- Não rodar como root (USER appuser)
- Healthcheck no Dockerfile para integração com orquestradores
