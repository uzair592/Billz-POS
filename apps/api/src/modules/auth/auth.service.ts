import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { LoginInput } from "@cafe-pos/contracts";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import {
  createSecret,
  hashPassword,
  sha256,
  verifyPassword,
} from "../../common/security";
import { MailService } from "./mail.service";
import { RateLimitService } from "./rate-limit.service";

interface Metadata {
  ipAddress?: string;
  userAgent?: string;
}

function deviceName(userAgent?: string): string {
  if (!userAgent) return "Unknown device";
  const platform = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad/i.test(userAgent)
      ? "iPhone / iPad"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS/i.test(userAgent)
          ? "Mac"
          : "Web device";
  const browser = /Edg/i.test(userAgent)
    ? "Edge"
    : /Chrome/i.test(userAgent)
      ? "Chrome"
      : /Safari/i.test(userAgent)
        ? "Safari"
        : /Firefox/i.test(userAgent)
          ? "Firefox"
          : "Browser";
  return `${platform} · ${browser}`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async login(
    input: LoginInput,
    metadata: Metadata,
    existingDeviceSecret?: string,
  ) {
    const rateKey = `business-login:${metadata.ipAddress ?? "unknown"}:${input.identifier}`;
    if (!(await this.rateLimit.consume(rateKey, 10, 15 * 60)))
      throw new ForbiddenException({
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Try again later.",
      });
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: input.identifier, mode: "insensitive" } },
          { email: { equals: input.identifier, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        passwordHash: true,
        status: true,
        mustChangePassword: true,
        lockedUntil: true,
        failedLoginCount: true,
        organization: {
          select: {
            slug: true,
            status: true,
            subscriptions: {
              where: { status: { in: ["ACTIVE", "TRIALING"] } },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { plan: true },
            },
          },
        },
      },
    });
    const passwordValid = user
      ? await verifyPassword(user.passwordHash, input.password)
      : false;

    if (!user || !passwordValid) {
      await this.prisma.loginAttempt.create({
        data: {
          organizationId: user?.organizationId,
          userId: user?.id,
          identifier: input.identifier,
          successful: false,
          failureCode: "INVALID_CREDENTIALS",
          ...metadata,
        },
      });
      if (user)
        await this.prisma.withTenant(user.organizationId, (tx) =>
          tx.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: { increment: 1 },
              lockedUntil:
                user.failedLoginCount >= 4
                  ? new Date(Date.now() + 15 * 60_000)
                  : undefined,
            },
          }),
        );
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Invalid sign-in details.",
      });
    }
    if (user.organization.status !== "ACTIVE")
      throw new ForbiddenException({
        code: "ORGANIZATION_SUSPENDED",
        message: "This business account is not active.",
      });
    if (
      user.status !== "ACTIVE" ||
      (user.lockedUntil && user.lockedUntil > new Date())
    )
      throw new ForbiddenException({
        code: "ACCOUNT_LOCKED",
        message: "This account is temporarily unavailable.",
      });
    const subscription = user.organization.subscriptions[0];
    if (
      !subscription ||
      (subscription.endsAt && subscription.endsAt <= new Date())
    )
      throw new ForbiddenException({
        code: "SUBSCRIPTION_EXPIRED",
        message: "This business subscription is not active.",
      });

    const token = createSecret();
    const csrfToken = createSecret();
    const hasValidDeviceSecret = Boolean(
      existingDeviceSecret && existingDeviceSecret.length >= 32,
    );
    const deviceSecret = hasValidDeviceSecret
      ? existingDeviceSecret!
      : createSecret();
    const deviceHash = sha256(deviceSecret);
    const expiresAt = new Date(
      Date.now() + this.config.get<number>("SESSION_TTL_HOURS", 12) * 3_600_000,
    );
    const session = await this.prisma.withTenant(
      user.organizationId,
      async (tx) => {
        let device = await tx.organizationDevice.findUnique({
          where: {
            organizationId_deviceHash: {
              organizationId: user.organizationId,
              deviceHash,
            },
          },
        });
        if (!device || device.revokedAt) {
          const registeredDevices = await tx.organizationDevice.count({
            where: { organizationId: user.organizationId, revokedAt: null },
          });
          if (registeredDevices >= subscription.plan.maxDevices) {
            throw new ForbiddenException({
              code: "DEVICE_LIMIT_REACHED",
              message: `This plan allows ${subscription.plan.maxDevices} devices. Remove an old device before signing in on a new one.`,
            });
          }
          device = device
            ? await tx.organizationDevice.update({
                where: { id: device.id },
                data: {
                  revokedAt: null,
                  displayName: deviceName(metadata.userAgent),
                  userAgent: metadata.userAgent,
                  lastIpAddress: metadata.ipAddress,
                  lastSeenAt: new Date(),
                },
              })
            : await tx.organizationDevice.create({
                data: {
                  organizationId: user.organizationId,
                  deviceHash,
                  displayName: deviceName(metadata.userAgent),
                  userAgent: metadata.userAgent,
                  lastIpAddress: metadata.ipAddress,
                },
              });
        } else {
          device = await tx.organizationDevice.update({
            where: { id: device.id },
            data: {
              displayName: deviceName(metadata.userAgent),
              userAgent: metadata.userAgent,
              lastIpAddress: metadata.ipAddress,
              lastSeenAt: new Date(),
            },
          });
        }
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });
        await tx.loginAttempt.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            identifier: input.identifier,
            successful: true,
            ...metadata,
          },
        });
        await tx.session.updateMany({
          where: {
            organizationId: user.organizationId,
            userId: user.id,
            deviceId: device.id,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        const created = await tx.session.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            deviceId: device.id,
            tokenHash: sha256(token),
            csrfHash: sha256(csrfToken),
            expiresAt,
            ...metadata,
          },
        });
        await this.audit.create(
          {
            organizationId: user.organizationId,
            userId: user.id,
            actorType: "USER",
            actorId: user.id,
            action: "auth.login",
            entityType: "Session",
            entityId: created.id,
            afterValue: { deviceId: device.id },
            ...metadata,
          },
          tx,
        );
        return created;
      },
    );
    return {
      token,
      csrfToken,
      deviceSecret: hasValidDeviceSecret ? undefined : deviceSecret,
      expiresAt,
      sessionId: session.id,
      user: {
        id: user.id,
        name: user.name,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(
    organizationId: string,
    userId: string,
    currentPassword: string,
    newPassword: string,
    metadata: Metadata,
  ) {
    const user = await this.prisma.withTenant(organizationId, (tx) =>
      tx.user.findFirstOrThrow({ where: { id: userId, organizationId } }),
    );
    if (!(await verifyPassword(user.passwordHash, currentPassword)))
      throw new UnauthorizedException({
        code: "INVALID_PASSWORD",
        message: "Current password is incorrect.",
      });
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.withTenant(organizationId, async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.session.updateMany({
        where: { userId, id: { not: undefined } },
        data: { revokedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId,
          userId,
          actorType: "USER",
          actorId: userId,
          action: "auth.password_changed",
          entityType: "User",
          entityId: userId,
          ...metadata,
        },
        tx,
      );
    });
  }

  async forgotPassword(identifier: string, metadata: Metadata) {
    if (
      !(await this.rateLimit.consume(
        `forgot:${metadata.ipAddress ?? "unknown"}:${identifier}`,
        5,
        30 * 60,
      ))
    )
      return;
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: identifier, mode: "insensitive" } },
          { email: { equals: identifier, mode: "insensitive" } },
        ],
        status: "ACTIVE",
      },
      select: { id: true, organizationId: true, email: true },
    });
    if (!user?.email) return;
    const token = createSecret();
    await this.prisma.withTenant(user.organizationId, async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
      await this.audit.create(
        {
          organizationId: user.organizationId,
          userId: user.id,
          actorType: "USER",
          actorId: user.id,
          action: "auth.password_reset_requested",
          entityType: "User",
          entityId: user.id,
          ...metadata,
        },
        tx,
      );
    });
    await this.mail.sendPasswordReset(user.email, token).catch(() => undefined);
  }

  async resetPassword(token: string, newPassword: string, metadata: Metadata) {
    const reset = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: sha256(token),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, organizationId: true, userId: true },
    });
    if (!reset)
      throw new UnauthorizedException({
        code: "RESET_TOKEN_INVALID",
        message: "This reset link is invalid or has expired.",
      });
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.withTenant(reset.organizationId, async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.session.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId: reset.organizationId,
          userId: reset.userId,
          actorType: "USER",
          actorId: reset.userId,
          action: "auth.password_reset_completed",
          entityType: "User",
          entityId: reset.userId,
          ...metadata,
        },
        tx,
      );
    });
  }
}
