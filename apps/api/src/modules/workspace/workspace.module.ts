import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { AuditLogsController } from './audit-logs.controller';

@Module({ imports: [AuthModule, AuditModule], controllers: [WorkspaceController, AuditLogsController], providers: [WorkspaceService] })
export class WorkspaceModule {}
