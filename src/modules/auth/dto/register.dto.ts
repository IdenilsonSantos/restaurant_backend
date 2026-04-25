import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

enum RegisterRole {
  CUSTOMER = 'customer',
  DRIVER = 'driver',
}

export class RegisterDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  phone!: string;

  @IsEnum(RegisterRole)
  role!: RegisterRole;
}
