import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  paymentMethodId!: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}
