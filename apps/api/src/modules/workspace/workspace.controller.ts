import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  branchSchema,
  employeeSchema,
  onboardingBusinessSchema,
  onboardingSettingsSchema,
} from "@cafe-pos/contracts";
import { z } from "zod";
import type { Request } from "express";
import { CurrentUser, RequirePermissions } from "../../common/auth.decorators";
import { requestMetadata } from "../../common/http";
import type { UserPrincipal } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { PermissionGuard, UserAuthGuard } from "../auth/auth.guards";
import { WorkspaceService } from "./workspace.service";

const permissionIdsSchema = z.object({
  permissionIds: z.array(z.string().uuid()),
});
const roleSchema=z.object({key:z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),name:z.string().trim().min(2).max(100),description:z.string().trim().max(500).optional(),permissionIds:z.array(z.string().uuid()),scope:z.record(z.unknown()).optional(),approvalLimitMinor:z.number().int().nonnegative().optional()});
const assignmentSchema=z.object({roleIds:z.array(z.string().uuid()).min(1),branchIds:z.array(z.string().uuid()).min(1)});
const approvalSchema=z.object({action:z.string().trim().min(1).max(100),payloadHash:z.string().regex(/^[a-f0-9]{64}$/i),amountMinor:z.number().int().nonnegative().optional(),expiresInSeconds:z.number().int().min(30).max(3600).optional()});

@Controller()
@UseGuards(UserAuthGuard, PermissionGuard)
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}

  @Get("organization")
  @RequirePermissions("organization.view")
  organization(@CurrentUser() user: UserPrincipal) {
    return this.service.organization(user.organizationId);
  }

  @Get("branches")
  @RequirePermissions("organization.view")
  branches(@CurrentUser() user: UserPrincipal) {
    return this.service.branches(user.organizationId);
  }

  @Post("branches")
  @RequirePermissions("branches.manage")
  createBranch(
    @CurrentUser() user: UserPrincipal,
    @Body(new ZodValidationPipe(branchSchema)) body: any,
    @Req() request: Request,
  ) {
    return this.service.createBranch(user, body, requestMetadata(request));
  }

  @Put("onboarding/business")
  @RequirePermissions("settings.manage")
  updateBusiness(
    @CurrentUser() user: UserPrincipal,
    @Body(new ZodValidationPipe(onboardingBusinessSchema)) body: any,
    @Req() request: Request,
  ) {
    return this.service.updateBusiness(user, body, requestMetadata(request));
  }

  @Put("onboarding/settings")
  @RequirePermissions("settings.manage")
  updateSettings(
    @CurrentUser() user: UserPrincipal,
    @Body(new ZodValidationPipe(onboardingSettingsSchema)) body: any,
    @Req() request: Request,
  ) {
    return this.service.updateSettings(user, body, requestMetadata(request));
  }

  @Post("onboarding/complete")
  @RequirePermissions("settings.manage")
  completeOnboarding(
    @CurrentUser() user: UserPrincipal,
    @Req() request: Request,
  ) {
    return this.service.completeOnboarding(user, requestMetadata(request));
  }

  @Get("users")
  @RequirePermissions("users.manage")
  users(@CurrentUser() user: UserPrincipal) {
    return this.service.users(user.organizationId);
  }

  @Post("users")
  @RequirePermissions("users.manage")
  createUser(
    @CurrentUser() user: UserPrincipal,
    @Body(new ZodValidationPipe(employeeSchema)) body: any,
    @Req() request: Request,
  ) {
    return this.service.createUser(user, body, requestMetadata(request));
  }

  @Put("users/:id/roles")
  @RequirePermissions("users.manage")
  assignRoles(@CurrentUser() user:UserPrincipal,@Param("id",ParseUUIDPipe) id:string,@Body(new ZodValidationPipe(assignmentSchema)) body:any,@Req() request:Request){return this.service.assignRoles(user,id,body.roleIds,body.branchIds,requestMetadata(request));}

  @Get("roles")
  @RequirePermissions("roles.manage")
  roles(@CurrentUser() user: UserPrincipal) {
    return this.service.roles(user.organizationId);
  }

  @Get("permissions")
  @RequirePermissions("roles.manage")
  permissions() {
    return this.service.permissions();
  }

  @Post("roles")
  @RequirePermissions("roles.manage")
  createRole(@CurrentUser() user:UserPrincipal,@Body(new ZodValidationPipe(roleSchema)) body:any,@Req() request:Request){return this.service.createRole(user,body,requestMetadata(request));}

  @Get("devices")
  @RequirePermissions("settings.manage")
  devices(@CurrentUser() user: UserPrincipal) {
    return this.service.devices(user);
  }

  @Post("devices/:id/revoke")
  @RequirePermissions("settings.manage")
  revokeDevice(
    @CurrentUser() user: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.service.revokeDevice(user, id, requestMetadata(request));
  }

  @Post("devices/recover")
  @RequirePermissions("settings.manage")
  recoverDevices(@CurrentUser() user:UserPrincipal,@Req() request:Request){return this.service.recoverDevices(user,requestMetadata(request));}

  @Post("approvals")
  @RequirePermissions("settings.manage")
  requestApproval(@CurrentUser() user:UserPrincipal,@Body(new ZodValidationPipe(approvalSchema)) body:any,@Req() request:Request){return this.service.requestApproval(user,body,requestMetadata(request));}

  @Post("approvals/:id/consume")
  @RequirePermissions("settings.manage")
  consumeApproval(@CurrentUser() user:UserPrincipal,@Param("id",ParseUUIDPipe) id:string,@Body(new ZodValidationPipe(z.object({payloadHash:z.string().regex(/^[a-f0-9]{64}$/i)}))) body:any,@Req() request:Request){return this.service.consumeApproval(user,id,body.payloadHash,requestMetadata(request));}

  @Put("roles/:id/permissions")
  @RequirePermissions("roles.manage")
  setRolePermissions(
    @CurrentUser() user: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(permissionIdsSchema)) body: any,
    @Req() request: Request,
  ) {
    return this.service.setRolePermissions(
      user,
      id,
      body.permissionIds,
      requestMetadata(request),
    );
  }
}
