import { Injectable } from '@nestjs/common';

/**
 * Contrato do serviço de storage.
 * O método upload deve retornar a URL pública permanente do arquivo.
 */
@Injectable()
export abstract class StorageService {
  /**
   * Faz upload de um buffer e retorna a URL pública do arquivo.
   * @param buffer   - conteúdo do arquivo em memória
   * @param mimetype - tipo MIME (ex: "image/jpeg")
   * @param key      - caminho/nome no storage (ex: "restaurants/<id>/logo-<uuid>.jpg")
   */
  abstract upload(
    buffer: Buffer,
    mimetype: string,
    key: string,
  ): Promise<string>;

  /**
   * Remove um arquivo pelo URL ou key.
   * Deve ser tolerante a falhas (arquivo já removido não lança exceção).
   */
  abstract delete(urlOrKey: string): Promise<void>;
}
