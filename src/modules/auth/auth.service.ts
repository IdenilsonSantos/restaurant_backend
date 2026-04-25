import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { StringValue } from 'ms';
import { UserService } from '../user/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserRole } from '../user/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.configService.getOrThrow<string>('JWT_SECRET') + '_refresh';
    this.refreshExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '30d',
    );
  }

  private generateTokens(payload: Omit<JwtPayload, 'type'>) {
    const accessToken = this.jwtService.sign({ ...payload, type: 'access' });

    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresIn as StringValue,
      },
    );

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto) {
    const existing = await this.userService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const user = await this.userService.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      phone: dto.phone,
      role: dto.role as unknown as UserRole,
    });

    const tokens = this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { ...tokens, user };
  }

  async login(dto: LoginDto) {
    const userWithHash = await this.userService.findByEmail(dto.email);
    if (!userWithHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      userWithHash.passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...user } = userWithHash;

    const tokens = this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { ...tokens, user };
  }

  async refresh(dto: RefreshTokenDto) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.userService.findOne(payload.sub);

    const tokens = this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { ...tokens, user };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userService.findByEmail(dto.email);

    // Sempre retorna sucesso para não expor se o email existe
    if (!user) {
      return {
        message: 'If this email is registered, a reset link has been sent',
      };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await this.userService.setResetPasswordToken(user.id, token, expires);

    // Em produção, enviaria o token por email.
    // Por ora, retorna o token na resposta (apenas para desenvolvimento).
    return {
      message: 'If this email is registered, a reset link has been sent',
      // Remover em produção:
      resetToken: token,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userService.findByResetToken(dto.token);

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    await this.userService.resetPassword(user.id, dto.newPassword);

    return { message: 'Password reset successfully' };
  }

  async validateUser(payload: JwtPayload) {
    return this.userService.findOne(payload.sub);
  }
}
