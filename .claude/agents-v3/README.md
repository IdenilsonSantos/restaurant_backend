# Agentes v3 — Sistema de Delivery (NestJS)

Versão enxuta dos agentes v2. Formato: specs de campo em prosa, specs de método como passos, código apenas para algoritmos complexos, contratos de interface e padrões que são fáceis de errar.

**Referência completa do sistema:** [SYSTEM-OVERVIEW.md](../agents-v2/SYSTEM-OVERVIEW.md)
**Regras de codificação:** [RULES.md](../RULES.md)

---

## Cadeia principal (sequencial)

| Agente | Descrição | Depende de |
|---|---|---|
| [e1-setup](e1-setup.md) | NestJS + Docker Dev + Health check | — |
| [e2-database](e2-database.md) | Entidades TypeORM + ENUMs + migration | E1 |
| [e3-restaurant](e3-restaurant.md) | Restaurant/User/Driver CRUD + busca + avaliações + favoritos + upload + open/close + cron | E2, E-Storage |
| [e4-auth](e4-auth.md) | JWT Auth + guards + decorators + forgot/reset password | E3 |
| [e5-orders](e5-orders.md) | Orders + state machine + product options + snapshots | E4, E7 |
| [e6-payment](e6-payment.md) | Payment + métodos de pagamento | E5 |
| [e7-redis](e7-redis.md) | Redis: cache, GEO, locks, rate limit, presença, tracking | E1 (paralelo com E5/E6) |
| [e8-delivery](e8-delivery.md) | Delivery + matching GEO + lock distribuído | E5, E7 |
| [e9-queues](e9-queues.md) | BullMQ: delivery-matching + notifications | E7, E8 |
| [e10-realtime](e10-realtime.md) | Socket.IO gateway + rooms + tracking em tempo real | E5, E8, E9 |
| [e11-observability](e11-observability.md) | Winston + GlobalExceptionFilter + ValidationPipe + fix api/v1 | E1-E10 |
| [e12-tests](e12-tests.md) | Testes unitários + e2e | E11 |
| [e13-docker-prod](e13-docker-prod.md) | Dockerfile multi-stage + docker-compose.prod.yml | E12 |
| [e14-cicd](e14-cicd.md) | GitHub Actions CI/CD pipeline | E12, E13 |

## Agentes extras

| Agente | Descrição | Depende de |
|---|---|---|
| [e-storage](e-storage.md) | Upload centralizado: local (dev) + S3 (prod) | E1 *(antes de E3)* |
| [e-products](e-products.md) | Rating de produto, tempo de preparo, origem culinária, destaque | E3, E5, E-Storage |
| [e-categories](e-categories.md) | Tags: Popular, Fast Delivery, High Class, Dine In, Pick Up | E3, E-Products |
| [e-location](e-location.md) | Endereços estruturados + geocodificação com cache Redis | E2, E7 |
