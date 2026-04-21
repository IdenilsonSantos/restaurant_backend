import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  IsUrl,
  Min,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsUUID()
  @IsNotEmpty()
  restaurantId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean = true;
}
