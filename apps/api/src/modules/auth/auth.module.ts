import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PermissionGuard, PlatformAuthGuard, UserAuthGuard } from './auth.guards';
import { MailService } from './mail.service';
import { RateLimitService } from './rate-limit.service';

@Module({ imports: [AuditModule], controllers: [AuthController], providers: [AuthService, UserAuthGuard, PermissionGuard, PlatformAuthGuard, MailService, RateLimitService], exports: [UserAuthGuard, PermissionGuard, PlatformAuthGuard, RateLimitService] })
export class AuthModule {}
