import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { validateEnvironment } from './config/env';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { PlatformModule } from './modules/platform/platform.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment, envFilePath: ['.env', '../../.env'] }),
    DatabaseModule,
    AuthModule,
    PlatformModule,
    WorkspaceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
