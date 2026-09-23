import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { BillingService } from "./billing.service";
import { BillingScheduler } from "./billing.scheduler";
import {
  OwnerBillingController,
  PlatformBillingController,
} from "./billing.controller";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [
    PlatformController,
    PlatformBillingController,
    OwnerBillingController,
  ],
  providers: [PlatformService, BillingService, BillingScheduler],
})
export class PlatformModule {}
