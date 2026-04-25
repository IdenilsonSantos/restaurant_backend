import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import { RedisService } from '../../modules/redis/redis.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RateLimit decorator — allow the request through
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const userId: string =
      (request as any).user?.id ?? request.ip ?? 'anonymous';
    const endpoint = `${request.method}:${request.route?.path ?? request.path}`;
    const key = `user:${userId}:${endpoint}`;

    const { allowed, remaining } = await this.redisService.rateLimit(
      key,
      options.limit,
      options.windowSeconds,
    );

    if (!allowed) {
      this.logger.warn(
        `Rate limit exceeded for user "${userId}" on "${endpoint}"`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          remaining,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
