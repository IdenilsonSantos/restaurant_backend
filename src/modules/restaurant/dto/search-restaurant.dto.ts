import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class SearchRestaurantDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyOpen?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  /** Tempo máximo de entrega em minutos */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  maxDeliveryMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radiusKm?: number;

  /**
   * 'distance'  → mais próximo primeiro (exige lat+lng)
   * 'delivery'  → menor tempo de entrega ajustado primeiro
   * 'rating'    → melhor avaliação primeiro
   * 'featured'  → destaques primeiro, depois totalOrders DESC
   */
  @IsOptional()
  sortBy?: 'distance' | 'delivery' | 'rating' | 'featured';
}
