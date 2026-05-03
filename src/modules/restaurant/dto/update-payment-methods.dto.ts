import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class UpdatePaymentMethodsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  paymentMethodIds!: string[];
}
