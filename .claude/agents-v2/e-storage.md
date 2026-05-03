---
name: e-storage
description: Agente de Storage — módulo centralizado de upload de imagens para usuários (avatar), restaurantes (logo/banner) e produtos. StorageService abstrato com LocalStorageService para dev e S3StorageService para prod. Depende da E1. Deve ser implementado antes de E3 e E-Products.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Você é responsável pelo módulo de **Storage (Upload de Imagens)**.

## Pré-requisito
PR da E1 mergeado. **Deve ser implementado antes de E3 e E-Products**, pois esses módulos dependem do `StorageService`.

## Dependências a instalar
```bash
npm install -D @types/multer
# Para dev (sem infra externa):
# Nenhuma dependência extra — usa o filesystem local

# Para produção com S3/R2/MinIO:
npm install @aws-sdk/client-s3
# Para Cloudinary (alternativa):
npm install cloudinary
```

---

## Visão geral

`StorageModule` é um módulo **global** com um `StorageService` abstrato. Em desenvolvimento, usa `LocalStorageService` (salva em `./uploads/`). Em produção, troca para `S3StorageService` ou `CloudinaryStorageService` apenas mudando `useClass` no módulo — zero alteração nos consumidores.

---

## Parte 1 — Estrutura de arquivos

```
src/modules/storage/
  storage.module.ts
  storage.service.ts         ← abstract class (contrato)
  local-storage.service.ts   ← dev: salva em ./uploads/
  s3-storage.service.ts      ← prod: AWS S3, R2, MinIO
  cloudinary-storage.service.ts  ← alternativa prod
  utils/
    image-validator.util.ts  ← validação de MIME e tamanho
    key-generator.util.ts    ← geração de keys únicas
```

---

## Parte 2 — Contrato (abstract class)

`src/modules/storage/storage.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';

export interface UploadResult {
  url: string;   // URL pública permanente
  key: string;   // Caminho/chave no storage (para deletar depois)
}

@Injectable()
export abstract class StorageService {
  /**
   * Faz upload de um arquivo em memória e retorna a URL pública.
   * @param buffer   - conteúdo do arquivo
   * @param mimetype - tipo MIME ('image/jpeg', 'image/png', 'image/webp')
   * @param key      - caminho no storage ex: 'users/uuid/avatar-uuid.jpg'
   */
  abstract upload(buffer: Buffer, mimetype: string, key: string): Promise<UploadResult>;

  /**
   * Remove um arquivo pelo key ou URL.
   * Tolerante a falhas — não lança exceção se arquivo não existir.
   */
  abstract delete(keyOrUrl: string): Promise<void>;

  /**
   * Retorna a URL pública de um key (sem fazer request).
   * Útil para construir URLs sem upload.
   */
  abstract getPublicUrl(key: string): string;
}
```

---

## Parte 3 — LocalStorageService (desenvolvimento)

`src/modules/storage/local-storage.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService, UploadResult } from './storage.service';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

@Injectable()
export class LocalStorageService extends StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadsDir: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.uploadsDir = join(process.cwd(), 'uploads');
    this.baseUrl = config.get<string>('APP_URL', 'http://localhost:3000');
  }

  async upload(buffer: Buffer, mimetype: string, key: string): Promise<UploadResult> {
    const filePath = join(this.uploadsDir, key);
    const dir = dirname(filePath);

    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(filePath, buffer);
    const url = `${this.baseUrl}/uploads/${key}`;
    return { url, key };
  }

  async delete(keyOrUrl: string): Promise<void> {
    const key = keyOrUrl.startsWith('http')
      ? keyOrUrl.replace(`${this.baseUrl}/uploads/`, '')
      : keyOrUrl;

    const filePath = join(this.uploadsDir, key);
    await unlink(filePath).catch(() => {
      this.logger.warn(`File not found for deletion: ${filePath}`);
    });
  }

  getPublicUrl(key: string): string {
    return `${this.baseUrl}/uploads/${key}`;
  }
}
```

> **IMPORTANTE**: Para servir os arquivos estáticos em dev, adicionar no `main.ts`:
> ```typescript
> import { NestExpressApplication } from '@nestjs/platform-express';
> import { join } from 'path';
>
> const app = await NestFactory.create<NestExpressApplication>(AppModule);
> app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
> ```

---

## Parte 4 — S3StorageService (produção)

`src/modules/storage/s3-storage.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { StorageService, UploadResult } from './storage.service';

@Injectable()
export class S3StorageService extends StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.bucket = config.getOrThrow<string>('STORAGE_BUCKET');
    this.publicBaseUrl = config.getOrThrow<string>('STORAGE_PUBLIC_URL');
    this.s3 = new S3Client({
      region: config.getOrThrow<string>('STORAGE_REGION'),
      endpoint: config.get<string>('STORAGE_ENDPOINT'), // opcional: R2, MinIO
      credentials: {
        accessKeyId: config.getOrThrow<string>('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('STORAGE_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: !!config.get('STORAGE_ENDPOINT'), // necessário para R2/MinIO
    });
  }

  async upload(buffer: Buffer, mimetype: string, key: string): Promise<UploadResult> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      ACL: 'public-read',
    }));
    const url = `${this.publicBaseUrl}/${key}`;
    return { url, key };
  }

  async delete(keyOrUrl: string): Promise<void> {
    const key = keyOrUrl.startsWith('http')
      ? keyOrUrl.replace(`${this.publicBaseUrl}/`, '')
      : keyOrUrl;

    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => {});
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }
}
```

---

## Parte 5 — Utilitários

`src/modules/storage/utils/image-validator.util.ts`:
```typescript
import { BadRequestException } from '@nestjs/common';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ImageValidationOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: Set<string>;
}

export function validateImageFile(
  file: Express.Multer.File,
  options: ImageValidationOptions = {},
): void {
  const maxSize = options.maxSizeBytes ?? MAX_SIZE_BYTES;
  const allowedTypes = options.allowedMimeTypes ?? ALLOWED_MIME_TYPES;

  if (!allowedTypes.has(file.mimetype)) {
    const allowed = [...allowedTypes].map(t => t.replace('image/', '')).join(', ');
    throw new BadRequestException(`Formato inválido. Permitido: ${allowed}`);
  }
  if (file.size > maxSize) {
    throw new BadRequestException(
      `Arquivo muito grande. Máximo: ${Math.round(maxSize / 1024 / 1024)}MB`,
    );
  }
}
```

`src/modules/storage/utils/key-generator.util.ts`:
```typescript
import { extname } from 'path';
import { v4 as uuid } from 'uuid';

/**
 * Gera uma key única no formato: {scope}/{ownerId}/{field}-{uuid}.{ext}
 * Ex: 'users/abc123/avatar-def456.jpg'
 *     'restaurants/abc123/logo-def456.png'
 *     'products/abc123/image-def456.webp'
 */
export function generateStorageKey(
  scope: 'users' | 'restaurants' | 'products',
  ownerId: string,
  field: string,
  originalname: string,
): string {
  const ext = extname(originalname).toLowerCase().replace('.jpeg', '.jpg');
  return `${scope}/${ownerId}/${field}-${uuid()}${ext}`;
}
```

---

## Parte 6 — StorageModule

`src/modules/storage/storage.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: StorageService,
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('STORAGE_PROVIDER', 'local');
        if (provider === 's3') return new S3StorageService(config);
        return new LocalStorageService(config);
      },
      inject: [ConfigService],
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
```

> `STORAGE_PROVIDER=local` em dev, `STORAGE_PROVIDER=s3` em prod. Trocar o provedor sem alterar nenhum consumidor.

---

## Parte 7 — Endpoints de upload por entidade

### 7.1 Upload de avatar do usuário

Adicionar em `UserController`:
```typescript
@UseGuards(JwtAuthGuard)
@Post('me/avatar')
@UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
uploadAvatar(
  @CurrentUser() user: any,
  @UploadedFile() file: Express.Multer.File,
) {
  return this.userService.uploadAvatar(user.id, file);
}

@UseGuards(JwtAuthGuard)
@Delete('me/avatar')
removeAvatar(@CurrentUser() user: any) {
  return this.userService.removeAvatar(user.id);
}
```

Adicionar em `UserService`:
```typescript
async uploadAvatar(userId: string, file: Express.Multer.File): Promise<{ url: string }> {
  validateImageFile(file);
  const user = await this.findOne(userId);

  if (user.avatarUrl) {
    await this.storageService.delete(user.avatarUrl).catch(() => {});
  }

  const key = generateStorageKey('users', userId, 'avatar', file.originalname);
  const { url } = await this.storageService.upload(file.buffer, file.mimetype, key);

  await this.userRepository.update(userId, { avatarUrl: url });
  return { url };
}

async removeAvatar(userId: string): Promise<void> {
  const user = await this.findOne(userId);
  if (user.avatarUrl) {
    await this.storageService.delete(user.avatarUrl).catch(() => {});
    await this.userRepository.update(userId, { avatarUrl: null });
  }
}
```

Adicionar campo na entidade `User` (se não existir):
```typescript
@Column({ type: 'varchar', nullable: true })
avatarUrl!: string | null;
```

### 7.2 Upload de logo/banner do restaurante

Adicionar em `RestaurantController` (já referenciado no E3):
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('restaurant_owner')
@Post(':id/images/logo')
@UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
uploadLogo(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: any,
  @UploadedFile() file: Express.Multer.File,
) {
  return this.restaurantService.uploadImage(id, user.id, 'logo', file);
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('restaurant_owner')
@Post(':id/images/banner')
@UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
uploadBanner(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: any,
  @UploadedFile() file: Express.Multer.File,
) {
  return this.restaurantService.uploadImage(id, user.id, 'banner', file);
}
```

Já documentado no E3. Usar `generateStorageKey('restaurants', restaurantId, field, file.originalname)`.

### 7.3 Upload de imagem de produto

Adicionar em `RestaurantController`:
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('restaurant_owner')
@Post(':restaurantId/products/:productId/image')
@UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
uploadProductImage(
  @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  @Param('productId', ParseUUIDPipe) productId: string,
  @CurrentUser() user: any,
  @UploadedFile() file: Express.Multer.File,
) {
  return this.restaurantService.uploadProductImage(restaurantId, productId, user.id, file);
}
```

Adicionar em `RestaurantService`:
```typescript
async uploadProductImage(
  restaurantId: string, productId: string, ownerId: string,
  file: Express.Multer.File,
): Promise<{ url: string }> {
  validateImageFile(file);
  const product = await this.productRepository.findOne({
    where: { id: productId, restaurantId },
    relations: ['restaurant'],
  });
  if (!product) throw new NotFoundException('Product not found');
  if (product.restaurant.ownerId !== ownerId) throw new ForbiddenException();

  if (product.imageUrl) {
    await this.storageService.delete(product.imageUrl).catch(() => {});
  }

  const key = generateStorageKey('products', productId, 'image', file.originalname);
  const { url } = await this.storageService.upload(file.buffer, file.mimetype, key);

  await this.productRepository.update(productId, { imageUrl: url });
  return { url };
}
```

---

## Parte 8 — Variáveis de ambiente

Adicionar ao `.env.example`:
```
# Storage
STORAGE_PROVIDER=local   # local | s3

# S3 / R2 / MinIO (apenas quando STORAGE_PROVIDER=s3)
STORAGE_BUCKET=
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_PUBLIC_URL=https://cdn.exemplo.com
STORAGE_ENDPOINT=           # opcional: https://seu.r2.cloudflarestorage.com

# URL base da aplicação (usada pelo LocalStorageService)
APP_URL=http://localhost:3000
```

---

## Parte 9 — Migration (campo `avatarUrl` no User)

Se o campo `avatarUrl` não existe na entidade `User`:
```bash
npm run migration:generate -- src/database/migrations/AddAvatarUrlToUser
npm run migration:run
```

---

## Parte 10 — Registrar no AppModule

```typescript
imports: [
  StorageModule,  // @Global — disponível em todos os módulos
  // ...
]
```

Adicionar `useStaticAssets` no `main.ts` para dev:
```typescript
// Em desenvolvimento, serve arquivos de ./uploads/
if (process.env.NODE_ENV !== 'production') {
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
}
```

---

## Endpoints resumo

| Método | Endpoint | Auth | Descrição |
|---|---|---|---|
| `POST` | `/users/me/avatar` | qualquer autenticado | Upload do avatar do usuário |
| `DELETE` | `/users/me/avatar` | qualquer autenticado | Remove o avatar |
| `POST` | `/restaurants/:id/images/logo` | restaurant_owner | Upload do logo |
| `POST` | `/restaurants/:id/images/banner` | restaurant_owner | Upload do banner |
| `POST` | `/restaurants/:rId/products/:pId/image` | restaurant_owner | Upload da imagem do produto |

Todos os endpoints retornam `{ url: string }` com a URL pública do arquivo.

---

## Fluxo de commit e PR

```bash
git checkout main && git pull origin main
git checkout -b feat/storage-module
git add src/modules/storage src/database/migrations/AddAvatarUrlToUser*
git commit -m "feat: add centralized storage module with local and S3 providers"
git push origin feat/storage-module
gh pr create \
  --title "feat: Storage - upload de imagens para usuários, restaurantes e produtos" \
  --base main \
  --body "## O que foi feito
- StorageService abstrato com contrato upload/delete/getPublicUrl
- LocalStorageService: salva em ./uploads/, serve via /uploads/:key (dev)
- S3StorageService: AWS S3, Cloudflare R2, MinIO (prod)
- StorageModule @Global — STORAGE_PROVIDER=local|s3 via env
- Utilitários: validateImageFile (MIME + tamanho) e generateStorageKey (key única)
- Upload de avatar do usuário (POST /users/me/avatar)
- Upload de logo/banner de restaurante (POST /restaurants/:id/images/logo|banner)
- Upload de imagem de produto (POST /restaurants/:rId/products/:pId/image)
- Todos os uploads apagam a imagem anterior no storage
- Campo avatarUrl adicionado à entidade User

## Depende de
PR E1 mergeado (deve rodar antes de E3)

## Trocar de local para S3 em prod
Apenas setar STORAGE_PROVIDER=s3 e as variáveis STORAGE_* no .env — nenhum código muda"
```

## Regras
- `StorageService` é `@Global()` — qualquer módulo pode injetar sem re-importar `StorageModule`
- Sempre deletar imagem anterior antes de fazer upload da nova
- Delete é tolerante a falhas (`.catch(() => {})`) — não deixar upload falhar por erro de limpeza
- Keys geradas com UUID — nunca usar nome original do arquivo (risco de colisão e path traversal)
- Validar MIME pelo campo `mimetype` do Multer, não pela extensão do arquivo
- `memoryStorage()` no Multer — buffer em memória, nunca disco temporário
- Adicionar `uploads/` ao `.gitignore`
