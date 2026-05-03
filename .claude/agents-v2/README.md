# Agentes v2 — Sistema de Delivery (NestJS)

Agentes reescritos e consolidados. Fusões realizadas:
- **E3** absorveu E3C (restaurant extras)
- **E5** absorveu E5B (product options)
- **E10** absorveu E11 (WebSocket + Tracking)
- **E11** (nova numeração) = antiga E12 (observabilidade)
- Numeração seguinte deslocada: E12=Testes, E13=Docker, E14=CI/CD

## Cadeia principal (obrigatória, sequencial)

| Agente | Descrição | Depende de |
|---|---|---|
| [e1-setup](e1-setup.md) | NestJS + Docker Dev + Health check + prefixo `api/v1` | — |
| [e2-database](e2-database.md) | Todas as entidades TypeORM + ENUMs + migration | E1 |
| [e3-restaurant](e3-restaurant.md) | Restaurant/User/Driver CRUD + busca Haversine + avaliações + favoritos + upload | E2 |
| [e4-auth](e4-auth.md) | JWT Auth + guards + decorators + forgot/reset password com email | E3 |
| [e5-orders](e5-orders.md) | Orders + state machine + product option groups + snapshots | E4, E7 |
| [e6-payment](e6-payment.md) | Payment module + métodos de pagamento | E5 |
| [e7-redis](e7-redis.md) | Redis: cache, GEO, locks, rate limit, presença, tracking | E1 (paralelo com E5/E6) |
| [e8-delivery](e8-delivery.md) | Delivery + matching algorithm + locks distribuídos | E5, E7 |
| [e9-queues](e9-queues.md) | BullMQ: delivery-matching + notifications | E7, E8 |
| [e10-realtime](e10-realtime.md) | Socket.IO gateway + rooms + tracking em tempo real | E5, E8, E9 |
| [e11-observability](e11-observability.md) | Winston logger + GlobalExceptionFilter + ValidationPipe + fix `api/v1` | E1-E10 |
| [e12-tests](e12-tests.md) | Testes unitários + e2e | E11 |
| [e13-docker-prod](e13-docker-prod.md) | Dockerfile multi-stage + docker-compose.prod.yml | E12 |
| [e14-cicd](e14-cicd.md) | GitHub Actions CI/CD pipeline | E12, E13 |

## Agentes extras (features adicionais)

| Agente | Descrição | Depende de |
|---|---|---|
| [e-storage](e-storage.md) | Upload centralizado: avatar de usuário, logo/banner de restaurante, imagem de produto; LocalStorage (dev) + S3/R2 (prod) | E1 *(antes de E3)* |
| [e-products](e-products.md) | Rating de produto, tempo de preparo, origem culinária, produtos em destaque | E3, E5, E-Storage |
| [e-categories](e-categories.md) | Tags: Popular, Fast Delivery, High Class, Dine In, Pick Up, Nearest (admin) | E3, E-Products |
| [e-location](e-location.md) | Endereços estruturados (rua, cidade, estado, país, CEP, lat/lng) + geocodificação | E2, E7 |

## Correções vs. agentes originais

| Problema | Agente original | Correção nos v2 |
|---|---|---|
| Prefixo `api` em vez de `api/v1` | E1, main.ts | Corrigido em E1 e E11 |
| `ValidationPipe` ausente | E12 | Adicionado em E11 com `whitelist + transform` |
| `GlobalExceptionFilter` ausente | E12 | Adicionado em E11 |
| `RequestLoggerInterceptor` ausente | E12 | Adicionado em E11 |
| E3C separado de E3 | E3, E3C | Fusão em E3 (um PR só) |
| E5B separado de E5 | E5, E5B | Fusão em E5 (um PR só) |
| E10/E11 separados | E10, E11 | Fusão em E10 (tracking completo) |
| Entidades E5B/E3C em E2 | E2 original | E2 v2 inclui TODAS as entidades |
| Dockerfile.dev ausente | E1 original | Adicionado em E1 v2 |
