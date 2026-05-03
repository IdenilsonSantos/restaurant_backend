---
name: e14-cicd
description: Etapa 14 — implementa pipeline CI/CD completo com GitHub Actions: lint, testes unitários, testes e2e com serviços reais, build de imagem Docker, push para GHCR e deploy via SSH. Depende das E12 e E13.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 14 — CI/CD Pipeline**.

## Pré-requisito
PRs das E12 e E13 mergeados na `main`.

## O que você deve criar

### Estrutura de arquivos
```
.github/
  workflows/
    ci.yml       # lint + testes unitários + testes e2e (todo PR)
    cd.yml       # build Docker + push GHCR + deploy SSH (push para main)
  dependabot.yml # atualização automática de deps
```

---

### 1. `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test -- --coverage
      - uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
        continue-on-error: true

  test-e2e:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: lint

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: delivery_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/delivery_test
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-secret-for-ci-min-32-chars
      JWT_EXPIRES_IN: 1d
      PORT: 3001
      CORS_ORIGIN: http://localhost:3001

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run migration:run
      - run: npm run test:e2e
```

---

### 2. `.github/workflows/cd.yml`

```yaml
name: CD

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/delivery-api

jobs:
  build-and-push:
    name: Build & Push Docker Image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    outputs:
      image-digest: ${{ steps.build.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix=sha-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: build-and-push
    environment: production

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /opt/delivery-api
            docker pull ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
            docker compose -f docker-compose.prod.yml up -d --no-deps app
            docker compose -f docker-compose.prod.yml exec -T app node dist/main migration:run
            docker system prune -f

      - name: Health check pós-deploy
        run: |
          sleep 20
          curl --fail --retry 5 --retry-delay 5 \
            https://${{ secrets.DEPLOY_HOST }}/api/v1/health
```

---

### 3. `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      nestjs:
        patterns: ["@nestjs/*"]
      typeorm:
        patterns: ["typeorm", "pg"]

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

### 4. Scripts obrigatórios no `package.json`

Verificar que existem:
```json
{
  "scripts": {
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand",
    "migration:run": "typeorm migration:run -d dist/config/data-source.js"
  }
}
```

---

### 5. Secrets necessários no GitHub

Configurar em `Settings → Secrets and variables → Actions`:
```
CODECOV_TOKEN        — opcional, relatório de cobertura
DEPLOY_HOST          — IP ou hostname do servidor de produção
DEPLOY_USER          — usuário SSH no servidor
DEPLOY_KEY           — conteúdo da chave SSH privada
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e14-cicd-pipeline
git add .github/
git commit -m "feat: add CI/CD pipeline with GitHub Actions, Docker build and SSH deploy"
git push origin feat/e14-cicd-pipeline
gh pr create \
  --title "feat: E14 - CI/CD Pipeline" \
  --base main \
  --body "## O que foi feito
- ci.yml: lint → unit tests (com coverage) → e2e (PostgreSQL + Redis como services)
- cd.yml: build Docker → push GHCR → deploy SSH → health check pós-deploy
- Cache de layers Docker com BuildKit (type=gha)
- Migrations rodadas automaticamente no deploy
- dependabot.yml para NPM e Docker semanalmente
- Grupos de dependências por pacote (nestjs, typeorm)

## Depende de
PRs E12 e E13 mergeados

## Secrets necessários
DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY (configurar em Settings > Secrets)"
```

## Regras
- CI executa em **todo PR** — merge bloqueado se falhar
- CD executa apenas ao fazer push na `main` (após CI passar)
- Cache Docker com `type=gha` — reduz tempo de build ~70%
- Health check pós-deploy obrigatório — job falha se API não responder
- Migrations rodam no deploy automaticamente — nunca manualmente em prod
