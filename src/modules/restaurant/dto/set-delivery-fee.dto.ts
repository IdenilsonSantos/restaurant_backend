import { IsNumber, Min, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class SetDeliveryFeeDto {
  /** Taxa de entrega em reais. Use 0 para entrega grátis. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryFee!: number;

  /** Se true, entrega grátis (equivalente a deliveryFee = 0) */
  @IsOptional()
  @IsBoolean()
  isFreeDelivery?: boolean;
}
