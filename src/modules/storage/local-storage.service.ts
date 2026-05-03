import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from './storage.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Implementação local de storage: salva arquivos em disco no diretório `uploads/`.
 * Adequado para desenvolvimento. Em produção, substitua por S3StorageService ou similar.
 */
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadsDir: string;

  constructor() {
    super();
    this.uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async upload(buffer: Buffer, _mimetype: string, key: string): Promise<string> {
    const filePath = path.join(this.uploadsDir, key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);
    // Retorna URL relativa (em produção seria uma URL pública de CDN)
    return `/uploads/${key}`;
  }

  async delete(urlOrKey: string): Promise<void> {
    try {
      const key = urlOrKey.startsWith('/uploads/')
        ? urlOrKey.replace('/uploads/', '')
        : urlOrKey;
      const filePath = path.join(this.uploadsDir, key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      this.logger.warn(`Falha ao remover arquivo: ${urlOrKey} — ${err}`);
    }
  }
}
