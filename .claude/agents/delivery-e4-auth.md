---
name: delivery-e4-auth
description: Etapa 4 do sistema de delivery — implementa autenticação JWT completa com registro, login, guards e decorators de roles. Depende das Etapas 1-3. Use após o PR da E3 ser mergeado.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 4 — Autenticação e Autorização** do sistema de delivery.

## Pré-requisito
PRs das Etapas 1, 2 e 3 mergeados na `main`.

## Dependências a instalar
```bash
npm install @nestjs/passport @nestjs/jwt passport passport-jwt
npm install -D @types/passport-jwt
```

## O que você deve criar

### AuthModule (`src/modules/auth/`)

**auth.module.ts** — importa JwtModule com secret e expiresIn do ConfigService, importa UserModule, exporta JwtModule.

**DTOs:**
- `register.dto.ts`: name, email, password (min 8), phone, role (só customer ou driver)
- `login.dto.ts`: email, password

**Interfaces:**
- `src/modules/auth/interfaces/jwt-payload.interface.ts`:
```typescript
export interface JwtPayload {
  sub: string;      // userId
  email: string;
  role: string;
}
```

**auth.service.ts:**
- `register(dto)` — valida email único, cria user via UserService, retorna token
- `login(dto)` — valida credenciais com bcrypt.compare, retorna token
- `validateUser(payload)` — usado pela strategy

**auth.controller.ts:**
- `POST /auth/register` — retorna `{ accessToken, user }`
- `POST /auth/login` — retorna `{ accessToken, user }`
- `GET /auth/me` — retorna usuário logado (protegido)

---

### JWT Strategy
`src/modules/auth/strategies/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    return this.authService.validateUser(payload);
  }
}
```

---

### Guards

`src/common/guards/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`src/common/guards/roles.guard.ts`:
```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}
```

---

### Decorators

`src/common/decorators/roles.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

`src/common/decorators/current-user.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

---

### Aplicar guards nos módulos existentes

Após criar os guards, voltar nos controllers das Etapas 3 e aplicar:
- `@UseGuards(JwtAuthGuard, RolesGuard)` nos endpoints que precisam de auth
- `@Roles('restaurant_owner')` para endpoints de restaurante
- `@Roles('driver')` para endpoints de driver
- Endpoints públicos: listagem de restaurantes, listagem de produtos

---

### Variável de ambiente
Adicionar ao `.env.example`:
```
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d
```

## Fluxo de commit e PR

1. `git checkout main && git pull origin main`
2. `git checkout -b feat/e4-authentication`
3. Criar todos os arquivos
4. `git add src/modules/auth src/common/guards src/common/decorators`
5. `git commit -m "feat: add JWT authentication with roles and guards"`
6. `git push origin feat/e4-authentication`
7. `gh pr create --title "feat: E4 - JWT Authentication" --base main --body "## O que foi feito\n- AuthModule com register e login\n- JWT Strategy com Passport\n- JwtAuthGuard e RolesGuard\n- Decorators @Roles e @CurrentUser\n- Guards aplicados nos módulos da E3\n\n## Depende de\nPR E3 mergeado\n\n## Endpoints\n- POST /auth/register\n- POST /auth/login\n- GET /auth/me"`

## Regras
- Nunca retornar passwordHash em nenhuma resposta
- JWT deve incluir sub (userId), email e role no payload
- Endpoints de listagem de restaurantes/produtos permanecem públicos
