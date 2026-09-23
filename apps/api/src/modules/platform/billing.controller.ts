import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import {
  CurrentPlatformAdmin,
  CurrentUser,
} from "../../common/auth.decorators";
import type {
  PlatformPrincipal,
  UserPrincipal,
} from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { PlatformAuthGuard, UserAuthGuard } from "../auth/auth.guards";
import {
  BillingService,
  invoiceSchema,
  planVersionSchema,
  settlementSchema,
  attachmentSchema,
} from "./billing.service";

@Controller("platform/billing")
@UseGuards(PlatformAuthGuard)
export class PlatformBillingController {
  constructor(private readonly billing: BillingService) {}
  @Get("metrics") metrics(@CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.billing.metrics(admin.platformAdminId);
  }
  @Post("plans/:planId/status") setPlanActive(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body(new ZodValidationPipe(z.object({ isActive: z.boolean() }))) body: any,
  ) {
    return this.billing.setPlanActive(
      admin.platformAdminId,
      planId,
      body.isActive,
    );
  }
  @Get("plans") plans(@CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.billing.plans(admin.platformAdminId);
  }
  @Post("plans") version(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body(new ZodValidationPipe(planVersionSchema)) body: any,
  ) {
    return this.billing.createVersion(admin.platformAdminId, body);
  }
  @Get(":id") summary(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.billing.summary(id, admin.platformAdminId);
  }
  @Get(":id/downgrade-preview/:planId") downgradePreview(@CurrentPlatformAdmin() admin:PlatformPrincipal,@Param('id',ParseUUIDPipe) id:string,@Param('planId',ParseUUIDPipe) planId:string){return this.billing.downgradePreview(admin.platformAdminId,id,planId);}
  @Post(":id/invoices") issue(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(invoiceSchema)) body: any,
  ) {
    return this.billing.issue(admin.platformAdminId, id, body);
  }
  @Post(":id/invoices/:invoiceId/settlements") settle(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Body(new ZodValidationPipe(settlementSchema)) body: any,
  ) {
    return this.billing.settle(admin.platformAdminId, id, invoiceId, body);
  }
  @Post(":id/invoices/:invoiceId/activate") activate(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
  ) {
    return this.billing.renew(admin.platformAdminId, id, invoiceId);
  }
  @Post(":id/invoices/:invoiceId/attachments") upload(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Body(new ZodValidationPipe(attachmentSchema)) body: any,
  ) {
    return this.billing.upload(admin.platformAdminId, id, invoiceId, body);
  }
  @Get(":id/attachments/:fileId") async download(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @Res() response: Response,
  ) {
    const file = await this.billing.download(id, fileId, admin.platformAdminId);
    sendAttachment(response, file);
  }
}

@Controller("billing")
@UseGuards(UserAuthGuard)
export class OwnerBillingController {
  constructor(private readonly billing: BillingService) {}
  @Get() summary(@CurrentUser() user: UserPrincipal) {
    if (!user.isOwner || user.mustChangePassword)
      throw new ForbiddenException(
        "Only an activated owner can view billing. Contact your owner for assistance.",
      );
    return this.billing.summary(user.organizationId);
  }
  @Get("attachments/:fileId") async download(
    @CurrentUser() user: UserPrincipal,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @Res() response: Response,
  ) {
    if (!user.isOwner || user.mustChangePassword)
      throw new ForbiddenException("Owner access required.");
    const file = await this.billing.download(user.organizationId, fileId);
    sendAttachment(response, file);
  }
}

function sendAttachment(
  response: Response,
  file: { name: string; mimeType: string; content: Uint8Array },
) {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Type", file.mimeType);
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="${file.name.replace(/[^\w .()-]/g, "_")}"`,
  );
  response.send(Buffer.from(file.content));
}
