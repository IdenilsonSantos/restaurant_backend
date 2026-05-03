---
name: e4-auth
description: Etapa 4 — implementa autenticação JWT completa com registro, login, esqueci minha senha (email com token), reset de senha, guards e decorators de roles. Depende das E1-E3.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Etapa 4 — Autenticação e Autorização.

## Pré-requisito
PRs E1, E2 e E3 mergeados.

## Dependências
```bash
npm install @nestjs/passport @nestjs/jwt passport passport-jwt bcrypt @nestjs/mailer nodemailer
npm install -D @types/passport-jwt @types/bcrypt @types/nodemailer
```

## AuthModule (`src/modules/auth/`)

Importa:
- `JwtModule.registerAsync` com `secret` e `expiresIn` do `ConfigService`
- `PassportModule`, `UserModule`

Exporta `JwtModule` (outros módulos precisam verificar tokens).

---

## DTOs

- **register.dto.ts**: name (string), email (string), password (string, min 8), phone (string), role (enum: `customer | driver`)
- **login.dto.ts**: email (string), password (string)
- **forgot-password.dto.ts**: email (string)
- **reset-password.dto.ts**: token (string), newPassword (string, min 8)

## Interface

```typescript
// src/modules/auth/interfaces/jwt-payload.interface.ts
export interface JwtPayload {
  sub: string;   // userId
  email: string;
  role: string;
}
```

---

## AuthService — métodos

**register(dto)**
1. Verificar email único — `ConflictException` se já existe
2. Hash com `bcrypt.hash(password, 10)`
3. Criar user via `UserService.create()`
4. Retornar `{ accessToken, user }` sem passwordHash

**login(dto)**
1. `UserService.findByEmail` → `UnauthorizedException` se não existe
2. `bcrypt.compare(password, user.passwordHash)` → `UnauthorizedException` se falso
3. Retornar `{ accessToken, user }` sem passwordHash

**validateUser(payload: JwtPayload)** — busca user pelo `payload.sub`; retorna `{ id, email, role }` (injetado em `request.user`)

**getMe(userId)** — retorna user sem passwordHash

**forgotPassword(dto)**
1. `UserService.findByEmail(dto.email)` — **retornar sem erro se não existe** (anti-enumeration)
2. Gerar token: `crypto.randomBytes(32).toString('hex')`
3. Expiração: `new Date(Date.now() + 3_600_000)` (1 hora)
4. Salvar: `UserService.saveResetToken(user.id, token, expires)`
5. Enviar email: link `${APP_URL}/reset-password?token={token}`

**resetPassword(dto)**
1. `UserService.findByResetToken(dto.token)` — `BadRequestException` se não existe
2. Verificar `user.resetPasswordExpires < new Date()` → `BadRequestException('Token inválido ou expirado')`
3. Hash novo password com bcrypt
4. `UserService.updatePassword(user.id, newHash)`
5. `UserService.saveResetToken(user.id, null, null)` — invalidar token após uso

---

## Endpoints

```
POST /auth/register        → { accessToken, user }
POST /auth/login           → { accessToken, user }
GET  /auth/me              → user logado (JwtAuthGuard)
POST /auth/forgot-password → { message: 'Email enviado se o endereço existir' }
POST /auth/reset-password  → { message: 'Senha redefinida com sucesso' }
```

---

## Campos de reset na entidade User

Verificar que `user.entity.ts` contém:
- `resetPasswordToken: string | null` (varchar, nullable)
- `resetPasswordExpires: Date | null` (timestamp, nullable)

Se não existirem, adicionar e gerar migration.

## Métodos no UserService (adicionar)

- `saveResetToken(userId, token|null, expires|null)` — `update(userId, { resetPasswordToken, resetPasswordExpires })`
- `findByResetToken(token)` — `findOne({ where: { resetPasswordToken: token } })`
- `updatePassword(userId, passwordHash)` — `update(userId, { passwordHash })`

---

## MailerModule

Configurar em `auth.module.ts` com `MailerModule.forRootAsync` usando `ConfigService`:
- `transport.host/port/secure/auth.user/auth.pass` das env vars
- `defaults.from` da env `MAIL_FROM`

`src/modules/auth/mailer.service.ts` — `sendResetPasswordEmail(to, name, token)`: envia email HTML com botão de reset apontando para `${APP_URL}/reset-password?token={token}`, válido por 1 hora.

Para dev local, usar Mailhog no docker-compose (`mailhog/mailhog`, portas 1025 SMTP / 8025 UI).

Variáveis no `.env.example`: `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `APP_URL`.

---

## JWT Strategy

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    return this.authService.validateUser(payload);
  }
}
```

---

## Guards (`src/common/guards/`)

**jwt-auth.guard.ts**: `@Injectable() export class JwtAuthGuard extends AuthGuard('jwt') {}`

**roles.guard.ts**: injeta `Reflector`; lê metadata `ROLES_KEY` do handler; retorna true se não há roles requeridas; verifica `requiredRoles.includes(user?.role)`.

---

## Decorators (`src/common/decorators/`)

**roles.decorator.ts**: `export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)`

**current-user.decorator.ts**: `createParamDecorator` que retorna `context.switchToHttp().getRequest().user`

---

## Aplicar guards nos controllers da E3

- `@Roles('restaurant_owner')` em escritas de restaurante/produto
- `@Roles('driver')` em endpoints de driver
- `@Roles('customer')` em avaliações e favoritos
- Listagem de restaurantes/produtos permanece pública

---

## Commit
```bash
git checkout -b feat/e4-authentication
git add src/modules/auth src/common/guards src/common/decorators src/database/migrations/
git commit -m "feat: add JWT auth, roles guards, forgot/reset password with email"
```

## Regras
- **Nunca retornar `passwordHash`** em qualquer resposta
- `forgotPassword` sempre retorna 200 com a mesma mensagem — nunca revelar se email existe
- Token de reset gerado com `crypto.randomBytes(32).toString('hex')` — nunca `Math.random()`
- Token expira em 1 hora; invalidar após uso (`resetPasswordToken = null`)
- `role` no register: apenas `customer` e `driver` podem se auto-registrar
