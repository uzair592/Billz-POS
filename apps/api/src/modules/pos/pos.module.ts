import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PosController } from "./pos.controller";
import { Phase4Controller } from "./phase4.controller";
import { PosService } from "./pos.service";
import { Phase4Service } from "./phase4.service";
@Module({ imports: [AuthModule, AuditModule], controllers: [PosController, Phase4Controller], providers: [PosService, Phase4Service] })
export class PosModule {}
