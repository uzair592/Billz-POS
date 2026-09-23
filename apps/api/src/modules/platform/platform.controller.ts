import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createOrganizationSchema,
  platformLoginSchema,
} from "@cafe-pos/contracts";
import { z } from "zod";
import type { Request, Response } from "express";
import { CurrentPlatformAdmin } from "../../common/auth.decorators";
import {
  clearSessionCookie,
  requestMetadata,
  setSessionCookie,
} from "../../common/http";
import type { PlatformPrincipal } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { PlatformAuthGuard } from "../auth/auth.guards";
import { PlatformService } from "./platform.service";

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]),
  reason: z.string().trim().min(3).max(1000),
  expiresAt: z.string().datetime().optional(),
});
const resetOwnerSchema = z.object({
  temporaryPassword: z.string().min(12).max(128),
  reason: z.string().trim().min(3).max(1000),
});
const modulesSchema = z.object({ moduleIds: z.array(z.string().uuid()) });
const subscriptionSchema = z.object({
  planId: z.string().uuid(),
  endsAt: z.string().datetime(),
  reason: z.string().trim().min(3).max(1000),
});

@Controller("platform")
export class PlatformController {
  constructor(
    private readonly service: PlatformService,
    private readonly config: ConfigService,
  ) {}

  @Post("auth/login")
  async login(
    @Body(new ZodValidationPipe(platformLoginSchema)) body: any,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.login(
      body.email,
      body.password,
      requestMetadata(request),
    );
    setSessionCookie(
      response,
      `${this.config.get("SESSION_COOKIE_NAME", "cafe_pos_session")}_platform`,
      result.token,
      result.expiresAt,
    );
    return {
      admin: result.admin,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
    };
  }

  @Post("auth/logout")
  @UseGuards(PlatformAuthGuard)
  async logout(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.service.logout(admin.sessionId);
    clearSessionCookie(
      response,
      `${this.config.get("SESSION_COOKIE_NAME", "cafe_pos_session")}_platform`,
    );
    return { success: true };
  }

  @Get("auth/session")
  @UseGuards(PlatformAuthGuard)
  session(@CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return { admin };
  }

  @Get("dashboard")
  @UseGuards(PlatformAuthGuard)
  dashboard(@CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.service.dashboard(admin.platformAdminId);
  }

  @Get("catalog")
  @UseGuards(PlatformAuthGuard)
  catalog() {
    return this.service.catalog();
  }

  @Get("organizations")
  @UseGuards(PlatformAuthGuard)
  organizations(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Query(
      new ZodValidationPipe(
        z.object({
          cursor: z.string().uuid().optional(),
          take: z.coerce.number().int().min(1).max(100).default(25),
          search: z.string().max(200).default(""),
          status: z.enum(["", "ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional(),
          planName: z.string().max(100).optional(),
          renewalBefore: z.union([z.literal(""), z.string().date()]).optional(),
          dueOnly: z.enum(["true", "false"]).default("false"),
        }),
      ),
    )
    query: any,
  ) {
    return this.service.listOrganizations(
      admin.platformAdminId,
      query.cursor,
      query.take,
      query.search,
      query.status || undefined,
      {
        planName: query.planName || undefined,
        renewalBefore: query.renewalBefore || undefined,
        dueOnly: query.dueOnly === "true",
      },
    );
  }

  @Get("organizations/:id")
  @UseGuards(PlatformAuthGuard)
  organization(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.organizationDetail(admin.platformAdminId, id);
  }

  @Get("organizations/:id/activity")
  @UseGuards(PlatformAuthGuard)
  activity(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.activity(admin.platformAdminId, id);
  }

  @Post("organizations/:id/recovery-link")
  @UseGuards(PlatformAuthGuard)
  recoveryLink(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body(
      new ZodValidationPipe(
        z.object({ reason: z.string().trim().min(3).max(1000) }),
      ),
    )
    body: any,
  ) {
    return this.service.recoveryLink(admin.platformAdminId, id, body.reason);
  }

  @Post("organizations")
  @UseGuards(PlatformAuthGuard)
  createOrganization(
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: any,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Req() request: Request,
  ) {
    return this.service.createOrganization(
      body,
      admin.platformAdminId,
      requestMetadata(request),
    );
  }

  @Post("organizations/:id/status")
  @UseGuards(PlatformAuthGuard)
  setStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(statusSchema)) body: any,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Req() request: Request,
  ) {
    return this.service.changeStatus(
      id,
      body.status,
      admin.platformAdminId,
      body.reason,
      requestMetadata(request),
      body.expiresAt,
    );
  }

  @Post("organizations/:id/reset-owner-password")
  @UseGuards(PlatformAuthGuard)
  resetOwner(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resetOwnerSchema)) body: any,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Req() request: Request,
  ) {
    return this.service.resetOwnerPassword(
      admin.platformAdminId,
      id,
      body.temporaryPassword,
      body.reason,
      requestMetadata(request),
    );
  }

  @Put("organizations/:id/modules")
  @UseGuards(PlatformAuthGuard)
  setModules(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(modulesSchema)) body: any,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Req() request: Request,
  ) {
    return this.service.setModules(
      admin.platformAdminId,
      id,
      body.moduleIds,
      requestMetadata(request),
    );
  }

  @Put("organizations/:id/subscription")
  @UseGuards(PlatformAuthGuard)
  setSubscription(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(subscriptionSchema)) body: any,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Req() request: Request,
  ) {
    return this.service.setSubscription(
      admin.platformAdminId,
      id,
      body.planId,
      body.endsAt,
      requestMetadata(request),
      body.reason,
    );
  }
}
