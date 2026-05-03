---
name: e-storage
description: Módulo de Storage — upload centralizado de imagens com StorageService abstrato (LocalStorage dev / S3 prod). Deve ser implementado antes de E3 e E-Products. Depende da E1.
tools: Bash, Read, Write, Edit, Glob, Grep
---

Módulo de Storage (Upload de Imagens).

## Pré-requisito
PR da E1 mergeado. Implementar **antes** de E3 e E-Products.

## Dependências
```bash
npm install -D @types/multer
# Prod:
npm install @aws-sdk/client-s3
```

## Estrutura
```
src/modules/storage/
  storage.module.ts
  storage.service.ts           ← abstract class
  local-storage.service.ts     ← dev
  s3-storage.service.ts        ← prod
  utils/
    image-validator.util.ts
    key-generator.util.ts
```

---

## Contrato (abstract class)

```typescript
// storage.service.ts
export interface UploadResult { url: string; key: string; }

@Injectable()
export abstract class StorageService {
  abstract upload(buffer: Buffer, mimetype: string, key: string): Promise<UploadResult>;
  abstract delete(keyOrUrl: string): Promise<void>;
  abstract getPublicUrl(key: string): string;
}
```

---

## LocalStorageService (dev)

```typescript
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly uploadsDir = join(process.cwd(), 'uploads');
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.baseUrl = config.get<string>('APP_URL', 'http://localhost:3000');
  }

  async upload(buffer: Buffer, _mimetype: string, key: string): Promise<UploadResult> {
    const filePath = join(this.uploadsDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return { url: `${this.baseUrl}/uploads/${key}`, key };
  }

  async delete(keyOrUrl: string): Promise<void> {
    const key = keyOrUrl.startsWith('http')
      ? keyOrUrl.replace(`${this.baseUrl}/uploads/`, '') : keyOrUrl;
    await unlink(join(this.uploadsDir, key)).catch(() => {});
  }

  getPublicUrl(key: string): string { return `${this.baseUrl}/uploads/${key}`; }
}
```

Adicionar no `main.ts` (dev):
```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
```

---

## S3StorageService (prod)

```typescript
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
      endpoint: config.get<string>('STORAGE_ENDPOINT'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('STORAGE_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: !!config.get('STORAGE_ENDPOINT'),
    });
  }

  async upload(buffer: Buffer, mimetype: string, key: string): Promise<UploadResult> {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: mimetype, ACL: 'public-read' }));
    return { url: `${this.publicBaseUrl}/${key}`, key };
  }

  async delete(keyOrUrl: string): Promise<void> {
    const key = keyOrUrl.startsWith('http') ? keyOrUrl.replace(`${this.publicBaseUrl}/`, '') : keyOrUrl;
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => {});
  }

  getPublicUrl(key: string): string { return `${this.publicBaseUrl}/${key}`; }
}
```

---

## Utilitários

```typescript
// image-validator.util.ts
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function validateImageFile(file: Express.Multer.File, maxSizeBytes = 5_242_880): void {
  if (!ALLOWED_MIMES.has(file.mimetype))
    throw new BadRequestException(`Formato inválido. Permitido: jpeg, png, webp, gif`);
  if (file.size > maxSizeBytes)
    throw new BadRequestException(`Arquivo muito grande. Máximo: ${maxSizeBytes / 1_048_576}MB`);
}

// key-generator.util.ts
export function generateStorageKey(scope: 'users'|'restaurants'|'products', ownerId: string, field: string, originalname: string): string {
  const ext = extname(originalname).toLowerCase().replace('.jpeg', '.jpg');
  return `${scope}/${ownerId}/${field}-${uuid()}${ext}`;
}
```

---

## StorageModule

```typescript
@Global()
@Module({
  imports: [ConfigModule],
  providers: [{
    provide: StorageService,
    useFactory: (config: ConfigService) => {
      const provider = config.get<string>('STORAGE_PROVIDER', 'local');
      return provider === 's3' ? new S3StorageService(config) : new LocalStorageService(config);
    },
    inject: [ConfigService],
  }],
  exports: [StorageService],
})
export class StorageModule {}
```

Registrar no `AppModule`. `STORAGE_PROVIDER=local` em dev, `s3` em prod.

---

## Variáveis de ambiente

```
STORAGE_PROVIDER=local|s3
STORAGE_BUCKET=my-bucket
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_PUBLIC_URL=https://my-bucket.s3.amazonaws.com
STORAGE_ENDPOINT=https://...  # opcional: R2, MinIO
```

Adicionar ao Joi schema em `env.validation.ts` com `.when('STORAGE_PROVIDER', { is: 's3', then: ... })`.

---

## Uso nos módulos consumidores

```typescript
// Injetar diretamente (StorageModule é @Global):
constructor(private readonly storageService: StorageService) {}

// Upload:
validateImageFile(file);
const key = generateStorageKey('restaurants', restaurantId, 'logo', file.originalname);
const { url } = await this.storageService.upload(file.buffer, file.mimetype, key);

// Delete antes de trocar imagem:
if (previousUrl) await this.storageService.delete(previousUrl).catch(() => {});
```

## Commit
```bash
git checkout -b feat/e-storage
git add src/modules/storage
git commit -m "feat: add abstract storage module with local and S3 implementations"
```

## Regras
- Keys sempre com UUID — nunca usar o nome original do arquivo (colisão + path traversal)
- Validar por `file.mimetype`, nunca por extensão
- Deletar arquivo anterior **antes** de salvar nova URL
- `StorageModule` é `@Global()` — nunca re-importar em feature modules
