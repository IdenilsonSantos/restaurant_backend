import 'multer';
import { BadRequestException } from '@nestjs/common';

const ALLOWED_TYPES = /^image\/(jpeg|png|webp)$/;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageFile(file: Express.Multer.File): void {
  if (!ALLOWED_TYPES.test(file.mimetype))
    throw new BadRequestException(
      'Apenas imagens JPEG, PNG e WebP são aceitas',
    );
  if (file.size > MAX_SIZE_BYTES)
    throw new BadRequestException('Imagem deve ter no máximo 5 MB');
}
