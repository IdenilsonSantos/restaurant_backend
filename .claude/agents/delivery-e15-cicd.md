---
name: delivery-e15-cicd
description: Etapa 15 do sistema de delivery — implementa pipeline CI/CD completo com GitHub Actions: lint, testes, build de imagem Docker, push para registry e deploy automático. Depende das Etapas 13 e 14.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 15 — CI/CD Pipeline** do sistema de delivery.

## Pré-requisito
PRs das Etapas 13 e 14 mergeados na `main`.

## O que você deve criar

### Estrutura de arquivos
```
.github/
  workflows/
    ci.yml          # lint + testes (todo PR)
    cd.yml          # build + push + deploy (push para main)
  dependabot.yml    # atualização automática de deps
```

---

### 1. `.github/workflows/ci.yml` — Lint e Testes

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

      - name: Install dependencies
        run: npm ci

      - name: Run lint
        run: npm run lint

      - name: Check formatting
        run: npm run format:check

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
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
      JWT_SECRET: test-secret-for-ci
      PORT: 3000

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run migrations
        run: npm run migration:run

      - name: Run e2e tests
        run: npm run test:e2e
```

---

### 2. `.github/workflows/cd.yml` — Build, Push e Deploy

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
      image-tag: ${{ steps.meta.outputs.tags }}
      image-digest: ${{ steps.build.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract Docker metadata
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
            docker system prune -f

      - name: Health check post-deploy
        run: |
          sleep 15
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

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

### 4. Scripts obrigatórios no package.json

Verificar que existem:
```json
{
  "scripts": {
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "migration:run": "typeorm migration:run -d dist/config/data-source.js"
  }
}
```

---

### 5. Secrets necessários no GitHub

Documentar no README ou wiki os secrets que precisam ser configurados:
```
CODECOV_TOKEN        — opcional, para relatório de cobertura
DEPLOY_HOST          — IP ou hostname do servidor
DEPLOY_USER          — usuário SSH
DEPLOY_KEY           — chave SSH privada
```

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e15-cicd-pipeline`
3. Criar todos os arquivos
4. `git add .github/`
5. `git commit -m "feat: add CI/CD pipeline with GitHub Actions"`
6. `git push origin feat/e15-cicd-pipeline`
7. `gh pr create --title "feat: E15 - CI/CD Pipeline" --base main --body "## O que foi feito\n- ci.yml: lint + testes unitários + testes e2e em todo PR\n- cd.yml: build Docker + push GHCR + deploy SSH ao mergear na main\n- Serviços PostgreSQL e Redis nativos no GitHub Actions para e2e\n- Cache de layers Docker (BuildKit)\n- Health check pós-deploy\n- dependabot.yml para atualização automática de deps\n\n## Depende de\nPRs E13 e E14 mergeados\n\n## Secrets necessários\nDEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY (configurar em Settings > Secrets)"`

## Regras
- CI roda em todo PR — bloquear merge se falhar
- CD roda apenas na main após CI passar
- Usar cache de layers do Docker para acelerar builds
- Health check pós-deploy obrigatório — falha o job se API não responder
