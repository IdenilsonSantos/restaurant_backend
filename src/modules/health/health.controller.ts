import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; timestamp: Date } {
    return {
      status: 'ok',
      timestamp: new Date(),
    };
  }
}
