import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsEnum,
  MinLength,
  IsOptional,
} from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole = UserRole.CUSTOMER;
}
