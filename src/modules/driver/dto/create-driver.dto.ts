import { IsString, IsNotEmpty, IsUUID, MinLength } from 'class-validator';

export class CreateDriverDto {
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  vehicleType!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  licensePlate!: string;
}
