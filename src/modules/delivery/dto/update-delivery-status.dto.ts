import { IsEnum } from 'class-validator';
import { DeliveryStatus } from '../../../common/enums/delivery-status.enum';

export class UpdateDeliveryStatusDto {
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;
}
