import { IsUUID } from 'class-validator';

export class CreateDeliveryDto {
  @IsUUID()
  orderId!: string;
}
