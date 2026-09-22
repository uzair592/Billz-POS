import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() { return { status: 'ok', service: 'cafe-pos-api', timestamp: new Date().toISOString() }; }
}
