---
name: e4-auth
description: Etapa 4 — implementa autenticação JWT completa com registro, login, esqueci minha senha (email com token), reset de senha, guards e decorators de roles. Depende das E1-E3.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pela **Etapa 4 — Autenticação e Autorização**.

## Pré-requisito
PRs das E1, E2 e E3 mergeados na `main`.

## Dependências a instalar
```bash
npm install @nestjs/passport @nestjs/jwt passport passport-jwt bcrypt @nestjs/mailer nodemailer
npm install -D @types/passport-jwt @types/bcrypt @types/nodemailer
```

## O que você deve criar

### AuthModule (`src/modules/auth/`)

**auth.module.ts**:
- Importa `JwtModule.registerAsync` com secret e expiresIn do ConfigService
- Importa `PassportModule`, `UserModule`
- Exporta `JwtModule` (outros módulos precisam verificar tokens)

**DTOs:**
- `register.dto.ts`: name, email, password (min 8), phone, role (enum: `customer | driver`)
- `login.dto.ts`: email, password
- `refresh-token.dto.ts`: refreshToken (string)
- `forgot-password.dto.ts`: email
- `reset-password.dto.ts`: token (string), newPassword (min 8)

**Interface:**
`src/modules/auth/interfaces/jwt-payload.interface.ts`:
```typescript
export interface JwtPayload {
  sub: string;   // userId
  email: string;
  role: string;
}
```

**auth.service.ts:**
- `register(dto)` — valida email único, hash bcrypt, cria via UserService, retorna token
- `login(dto)` — valida credenciais com `bcrypt.compare`, retorna `{ accessToken, user }`
- `validateUser(payload: JwtPayload)` — busca usuário pelo payload; retorna `{ id, email, role }` (usado pela strategy)
- `getMe(userId)` — retorna usuário sem passwordHash
- `forgotPassword(dto)` — gera token seguro, salva no User, envia email com link de reset
- `resetPassword(dto)` — valida token, verifica expiração, atualiza senha, invalida token

**auth.controller.ts:**
```
POST /auth/register        → retorna { accessToken, user }
POST /auth/login           → retorna { accessToken, user }
GET  /auth/me              → retorna usuário logado (requer JwtAuthGuard)
POST /auth/forgot-password → retorna { message: 'Email enviado se o endereço existir' }
POST /auth/reset-password  → retorna { message: 'Senha redefinida com sucesso' }
```

---

### Fluxo de Esqueci Minha Senha

#### 1. Campos na entidade `User`

Verificar que `src/modules/user/entities/user.entity.ts` contém:
```typescript
@Column({ type: 'varchar', nullable: true })
resetPasswordToken!: string | null;

@Column({ type: 'timestamp', nullable: true })
resetPasswordExpires!: Date | null;
```
Se não existirem, adicioná-los e gerar uma migration.

#### 2. `AuthService.forgotPassword(dto)`

```typescript
async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
  const user = await this.userService.findByEmail(dto.email);

  // SEMPRE retornar sucesso mesmo se email não existe — evita user enumeration
  if (!user) return;

  // Gerar token seguro de 32 bytes (hex = 64 chars)
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await this.userService.saveResetToken(user.id, token, expires);
  await this.mailerService.sendResetPasswordEmail(user.email, user.name, token);
}
```

#### 3. `AuthService.resetPassword(dto)`

```typescript
async resetPassword(dto: ResetPasswordDto): Promise<void> {
  const user = await this.userService.findByResetToken(dto.token);

  if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
    throw new BadRequestException('Token inválido ou expirado');
  }

  const newHash = await bcrypt.hash(dto.newPassword, 10);
  await this.userService.updatePassword(user.id, newHash);
  // Invalidar token após uso
  await this.userService.saveResetToken(user.id, null, null);
}
```

#### 4. Métodos no `UserService`

Adicionar em `user.service.ts`:
```typescript
async saveResetToken(userId: string, token: string | null, expires: Date | null): Promise<void> {
  await this.userRepository.update(userId, {
    resetPasswordToken: token,
    resetPasswordExpires: expires,
  });
}

async findByResetToken(token: string): Promise<User | null> {
  return this.userRepository.findOne({
    where: { resetPasswordToken: token },
  });
}

async updatePassword(userId: string, passwordHash: string): Promise<void> {
  await this.userRepository.update(userId, { passwordHash });
}
```

---

### MailerModule — envio de email

#### Configuração

`src/modules/auth/auth.module.ts` — importar `MailerModule`:
```typescript
MailerModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    transport: {
      host: config.get<string>('MAIL_HOST'),
      port: config.get<number>('MAIL_PORT', 587),
      secure: config.get<boolean>('MAIL_SECURE', false),
      auth: {
        user: config.get<string>('MAIL_USER'),
        pass: config.get<string>('MAIL_PASS'),
      },
    },
    defaults: {
      from: config.get<string>('MAIL_FROM', '"Delivery App" <noreply@delivery.app>'),
    },
  }),
  inject: [ConfigService],
}),
```

#### MailerService (`src/modules/auth/mailer.service.ts`)

```typescript
@Injectable()
export class MailerService {
  constructor(
    @InjectMailer() private readonly mailer: MailerService_,
    private readonly config: ConfigService,
  ) {}

  async sendResetPasswordEmail(to: string, name: string, token: string): Promise<void> {
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    await this.mailer.sendMail({
      to,
      subject: 'Redefinição de senha — Delivery App',
      html: `
        <h2>Olá, ${name}</h2>
        <p>Recebemos uma solicitação para redefinir sua senha.</p>
        <p>Clique no link abaixo para criar uma nova senha. O link é válido por <strong>1 hora</strong>.</p>
        <p>
          <a href="${resetUrl}" style="background:#FF5733;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;">
            Redefinir senha
          </a>
        </p>
        <p>Se você não solicitou a redefinição, ignore este email — sua senha permanece a mesma.</p>
        <hr>
        <p style="color:#999;font-size:12px;">
          Se o botão não funcionar, copie e cole este link no navegador:<br>
          ${resetUrl}
        </p>
      `,
    });
  }
}
```

#### Variáveis de ambiente

Adicionar ao `.env.example`:
```
# Email (SMTP)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=seu-email@gmail.com
MAIL_PASS=sua-app-password
MAIL_FROM="Delivery App" <noreply@delivery.app>

# URL do frontend (usada no link de reset)
APP_URL=http://localhost:3000
```

**Para desenvolvimento local** use [Mailtrap](https://mailtrap.io) ou [Mailhog](https://github.com/mailhog/MailHog) em Docker:
```yaml
# Adicionar ao docker-compose.yml (dev)
mailhog:
  image: mailhog/mailhog
  ports:
    - "1025:1025"  # SMTP
    - "8025:8025"  # UI web
  networks:
    - app-network
```
Configuração para MailHog: `MAIL_HOST=localhost`, `MAIL_PORT=1025`, `MAIL_USER=` (vazio), `MAIL_PASS=` (vazio).

---

### Migration para campos de reset

Se os campos `resetPasswordToken` e `resetPasswordExpires` não existirem na entidade User:
```bash
npm run migration:generate -- src/database/migrations/AddResetPasswordFields
npm run migration:run
```

A migration deve adicionar:
- `ALTER TABLE users ADD COLUMN "resetPasswordToken" varchar NULL`
- `ALTER TABLE users ADD COLUMN "resetPasswordExpires" timestamp NULL`

**auth.controller.ts:**
```
POST /auth/register        → retorna { accessToken, user }
POST /auth/login           → retorna { accessToken, user }
GET  /auth/me              → retorna usuário logado (requer JwtAuthGuard)
POST /auth/forgot-password → retorna { message: 'Email enviado se o endereço existir' }
POST /auth/reset-password  → retorna { message: 'Senha redefinida com sucesso' }
```

---

### JWT Strategy

`src/modules/auth/strategies/jwt.strategy.ts`:
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
    // O que esta função retorna será injetado em request.user
  }
}
```

---

### Guards (`src/common/guards/`)

`jwt-auth.guard.ts`:
```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`roles.guard.ts`:
```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
```

---

### Decorators (`src/common/decorators/`)

`roles.decorator.ts`:
```typescript
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

`current-user.decorator.ts`:
```typescript
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
```

---

### Aplicar guards nos módulos E3

Após criar os guards, aplicar proteção nos controllers:
- `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('restaurant_owner')` em endpoints de escrita de restaurante
- `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('driver')` em endpoints de driver
- `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('customer')` em endpoints de avaliação e favoritos
- Listagem de restaurantes e produtos permanece pública

---

### Variáveis de ambiente
Verificar que `.env.example` contém:
```
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=7d
```

---

## Fluxo de commit e PR
```bash
git checkout main && git pull origin main
git checkout -b feat/e4-authentication
git add src/modules/auth src/common/guards src/common/decorators src/database/migrations/AddResetPasswordFields*
git commit -m "feat: add JWT auth, roles guards, forgot/reset password with email"
git push origin feat/e4-authentication
gh pr create \
  --title "feat: E4 - JWT Authentication + Forgot Password" \
  --base main \
  --body "## O que foi feito
- AuthModule com register, login e GET /me
- JWT Strategy com Passport
- JwtAuthGuard e RolesGuard
- @Roles() e @CurrentUser() decorators
- Guards aplicados nos controllers da E3
- Forgot password: gera token seguro (32 bytes), TTL 1 hora, envia email com link
- Reset password: valida token + expiração, atualiza senha, invalida token após uso
- MailerModule com SMTP configurável (Mailtrap/Mailhog para dev, Gmail/SendGrid para prod)

## Depende de
PR E3 mergeado

## Endpoints
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- GET  /api/v1/auth/me
- POST /api/v1/auth/forgot-password
- POST /api/v1/auth/reset-password

## Segurança
- forgot-password sempre retorna 200 mesmo se email não existe (evita user enumeration)
- Token de reset expira em 1 hora
- Token é invalidado após uso (não pode reutilizar)"
```

## Regras
- **Nunca retornar `passwordHash`** em nenhuma resposta
- JWT payload deve conter `sub` (userId), `email` e `role`
- `forgotPassword` deve retornar **sempre** `{ message: '...' }` com status 200 — nunca revelar se email existe ou não
- Token de reset gerado com `crypto.randomBytes(32).toString('hex')` — nunca com `Math.random()`
- Token expira em 1 hora — `resetPasswordExpires < new Date()` → `BadRequestException`
- Após reset bem-sucedido, setar `resetPasswordToken = null` e `resetPasswordExpires = null`
- Endpoints públicos: listagem de restaurantes e produtos, forgot-password, reset-password
- Validar `role` no register — customer e driver apenas podem se auto-registrar
