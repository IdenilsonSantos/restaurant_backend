---
name: e14-cicd
description: Etapa 14 — pipeline CI/CD com GitHub Actions: lint, testes unitários, e2e com serviços reais, build Docker, push GHCR e deploy SSH. Depende das E12 e E13.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 14 — CI/CD Pipeline.

## Pré-requisito
PRs E12 e E13 mergeados.

## Estrutura
```
.github/workflows/ci.yml       # lint + testes (todo PR)
.github/workflows/cd.yml       # build + push + deploy (push main)
.github/dependabot.yml
```

## `.github/workflows/ci.yml`

```yaml
name: CI
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  test-unit:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run test -- --coverage

  test-e2e:
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: delivery_test }
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5
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
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - run: npm run migration:run
      - run: npm run test:e2e
```

## `.github/workflows/cd.yml`

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
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    outputs:
      image-digest: ${{ steps.build.outputs.digest }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix=sha-
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/setup-buildx-action@v3
      - id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    runs-on: ubuntu-latest
    needs: build-and-push
    environment: production
    steps:
      - uses: appleboy/ssh-action@v1
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
      - name: Health check
        run: |
          sleep 20
          curl --fail --retry 5 --retry-delay 5 https://${{ secrets.DEPLOY_HOST }}/api/v1/health
```

## `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly" }
    open-pull-requests-limit: 5
    groups:
      nestjs: { patterns: ["@nestjs/*"] }
      typeorm: { patterns: ["typeorm", "pg"] }
  - package-ecosystem: "docker"
    directory: "/"
    schedule: { interval: "weekly" }
```

## Secrets necessários

`Settings → Secrets → Actions`: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `CODECOV_TOKEN` (opcional).

## Commit
```bash
git checkout -b feat/e14-cicd-pipeline
git add .github/
git commit -m "feat: add CI/CD pipeline with GitHub Actions, Docker build and SSH deploy"
```

## Regras
- CI executa em todo PR — merge bloqueado se falhar
- CD apenas no push da main (após CI)
- Cache Docker `type=gha` — reduz build ~70%
- Health check pós-deploy obrigatório
- Migrations rodam automaticamente no deploy
