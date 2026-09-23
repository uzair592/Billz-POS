import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "@cafe-pos/contracts";
import type { Request, Response } from "express";
import { CurrentUser } from "../../common/auth.decorators";
import {
  clearSessionCookie,
  requestMetadata,
  setDeviceCookie,
  setSessionCookie,
} from "../../common/http";
import type {
  AuthenticatedRequest,
  UserPrincipal,
} from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { PermissionGuard, UserAuthGuard } from "./auth.guards";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: any,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const deviceCookieName = `${this.config.get("SESSION_COOKIE_NAME", "cafe_pos_session")}_device`;
    const result = await this.auth.login(
      body,
      requestMetadata(request),
      request.cookies?.[deviceCookieName],
    );
    setSessionCookie(
      response,
      this.config.get("SESSION_COOKIE_NAME", "cafe_pos_session"),
      result.token,
      result.expiresAt,
    );
    if (result.deviceSecret)
      setDeviceCookie(response, deviceCookieName, result.deviceSecret);
    return {
      user: result.user,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
    };
  }

  @Get("session")
  @UseGuards(UserAuthGuard)
  session(@CurrentUser() user: UserPrincipal) {
    return { user };
  }

  @Post("logout")
  @UseGuards(UserAuthGuard)
  async logout(
    @CurrentUser() user: UserPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(user.sessionId, user.organizationId);
    clearSessionCookie(
      response,
      this.config.get("SESSION_COOKIE_NAME", "cafe_pos_session"),
    );
    return { success: true };
  }

  @Post("change-temporary-password")
  @UseGuards(UserAuthGuard, PermissionGuard)
  async changePassword(
    @CurrentUser() user: UserPrincipal,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: any,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.changePassword(
      user.organizationId,
      user.userId,
      body.currentPassword,
      body.newPassword,
      requestMetadata(request),
    );
    clearSessionCookie(
      response,
      this.config.get("SESSION_COOKIE_NAME", "cafe_pos_session"),
    );
    return {
      success: true,
      message: "Password changed. Please sign in again.",
    };
  }

  @Post("forgot-password")
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: any,
    @Req() request: Request,
  ) {
    await this.auth.forgotPassword(body.identifier, requestMetadata(request));
    return {
      success: true,
      message: "If the account can receive email, a reset link has been sent.",
    };
  }

  @Post("reset-password")
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: any,
    @Req() request: Request,
  ) {
    await this.auth.resetPassword(
      body.token,
      body.newPassword,
      requestMetadata(request),
    );
    return { success: true, message: "Password reset. You can now sign in." };
  }
}
