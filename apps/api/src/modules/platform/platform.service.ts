import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { CreateOrganizationInput } from "@cafe-pos/contracts";
import {
  createSecret,
  hashPassword,
  sha256,
  verifyPassword,
} from "../../common/security";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RateLimitService } from "../auth/rate-limit.service";
import { nextMonth } from "./billing.rules";

interface Metadata {
  ipAddress?: string;
  userAgent?: string;
}

const DEFAULT_ROLES: Record<string, string[]> = {
  owner: ["*"],
  manager: [
    "organization.view",
    "branches.manage",
    "users.manage",
    "roles.manage",
    "settings.manage",
    "audit.view",
  ],
  cashier: ["organization.view"],
  waiter: ["organization.view"],
  kitchen_staff: ["organization.view"],
  inventory_manager: ["organization.view"],
  accountant: ["organization.view"],
};

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async login(email: string, password: string, metadata: Metadata) {
    if (
      !(await this.rateLimit.consume(
        `platform-login:${metadata.ipAddress ?? "unknown"}:${email.toLowerCase()}`,
        8,
        15 * 60,
      ))
    ) {
      throw new UnauthorizedException({
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Try again later.",
      });
    }
    const admin = await this.prisma.platform.platformAdmin.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (
      !admin ||
      !admin.isActive ||
      !(await verifyPassword(admin.passwordHash, password))
    ) {
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Invalid sign-in details.",
      });
    }
    const token = createSecret();
    const csrfToken = createSecret();
    const expiresAt = new Date(
      Date.now() + this.config.get<number>("SESSION_TTL_HOURS", 12) * 3_600_000,
    );
    const session = await this.prisma.platform.platformSession.create({
      data: {
        platformAdminId: admin.id,
        tokenHash: sha256(token),
        csrfHash: sha256(csrfToken),
        expiresAt,
        ...metadata,
      },
    });
    await this.prisma.platform.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.create({
      actorType: "PLATFORM_ADMIN",
      actorId: admin.id,
      action: "platform.login",
      entityType: "PlatformSession",
      entityId: session.id,
      ...metadata,
    });
    return {
      token,
      csrfToken,
      expiresAt,
      admin: { id: admin.id, name: admin.name, email: admin.email },
    };
  }

  async logout(sessionId: string) {
    await this.prisma.platform.platformSession.updateMany({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async dashboard(platformAdminId: string) {
    const now = new Date();
    const inThirtyDays = new Date(now.getTime() + 30 * 86_400_000);
    const [total, active, suspended, branches, users, expiring] =
      await this.prisma.withPlatform(platformAdminId, (tx) =>
        Promise.all([
          tx.organization.count(),
          tx.organization.count({ where: { status: "ACTIVE" } }),
          tx.organization.count({ where: { status: "SUSPENDED" } }),
          tx.branch.count(),
          tx.user.count(),
          tx.organizationSubscription.count({
            where: {
              endsAt: { gte: now, lte: inThirtyDays },
              status: { in: ["ACTIVE", "TRIALING"] },
            },
          }),
        ]),
      );
    return {
      totalBusinesses: total,
      activeBusinesses: active,
      suspendedBusinesses: suspended,
      totalBranches: branches,
      totalUsers: users,
      expiringSubscriptions: expiring,
    };
  }

  async catalog() {
    const [plans, modules] = await Promise.all([
      this.prisma.platform.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.platform.module.findMany({
        where: { isActive: true, phase: 1 },
        orderBy: { name: "asc" },
      }),
    ]);
    return { plans, modules };
  }

  listOrganizations(
    platformAdminId: string,
    cursor?: string,
    take = 25,
    search = "",
    status?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED",
    filters: {
      planName?: string;
      renewalBefore?: string;
      dueOnly?: boolean;
    } = {},
  ) {
    const size = Math.min(Math.max(take, 1), 100);
    return this.prisma
      .withPlatform(platformAdminId, async (tx) => {
        const dueIds = filters.dueOnly
          ? await tx.$queryRaw<
              { organization_id: string }[]
            >`SELECT DISTINCT i.organization_id FROM billing_invoices i WHERE i.total_minor > COALESCE((SELECT SUM(s.amount_minor) FROM billing_settlements s WHERE s.invoice_id=i.id),0)`
          : undefined;
        return tx.organization.findMany({
          where: {
            name: { contains: search, mode: "insensitive" },
            status,
            id: dueIds
              ? { in: dueIds.map((row) => row.organization_id) }
              : undefined,
            subscriptions:
              filters.planName || filters.renewalBefore
                ? {
                    some: {
                      status: {
                        in: ["ACTIVE", "TRIALING", "PAST_DUE", "EXPIRED"],
                      },
                      plan: filters.planName
                        ? { name: filters.planName }
                        : undefined,
                      endsAt: filters.renewalBefore
                        ? { lte: new Date(filters.renewalBefore) }
                        : undefined,
                    },
                  }
                : undefined,
          },
          take: size + 1,
          skip: cursor ? 1 : 0,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            _count: { select: { branches: true, users: true } },
            subscriptions: {
              take: 1,
              orderBy: { createdAt: "desc" },
              include: { plan: true },
            },
          },
        });
      })
      .then((rows) => ({
        items: rows.slice(0, size),
        nextCursor: rows.length > size ? rows[size - 1]?.id : null,
      }));
  }

  organizationDetail(platformAdminId: string, id: string) {
    return this.prisma.withPlatform(platformAdminId, (tx) =>
      tx.organization.findUnique({
        where: { id },
        include: {
          subscriptions: {
            orderBy: { createdAt: "desc" },
            include: { plan: true },
          },
          modules: { include: { module: true } },
          _count: { select: { branches: true, users: true } },
          supportNotes: { orderBy: { createdAt: "desc" } },
          branches: { select: { id: true, name: true, isActive: true } },
          users: {
            where: { roles: { some: { role: { key: "owner" } } } },
            select: { name: true, email: true, phone: true },
          },
          devices: {
            where: { revokedAt: null },
            select: { id: true, displayName: true, lastSeenAt: true },
          },
        },
      }),
    );
  }

  activity(platformAdminId: string, organizationId: string) {
    return this.prisma.withPlatform(platformAdminId, (tx) =>
      tx.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  }

  async recoveryLink(
    platformAdminId: string,
    organizationId: string,
    reason: string,
  ) {
    const token = createSecret();
    await this.prisma.withPlatform(platformAdminId, async (tx) => {
      const owner = await tx.user.findFirst({
        where: { organizationId, roles: { some: { role: { key: "owner" } } } },
      });
      if (!owner) throw new NotFoundException("Owner not found.");
      await tx.passwordResetToken.updateMany({
        where: { userId: owner.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          organizationId,
          userId: owner.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorType: "PLATFORM_ADMIN",
          actorId: platformAdminId,
          action: "owner.recovery_link_issued",
          entityType: "User",
          entityId: owner.id,
          reason,
        },
        tx,
      );
    });
    return {
      url: `${this.config.get("WEB_URL", "http://localhost:3000")}/reset-password?token=${encodeURIComponent(token)}`,
      expiresInMinutes: 30,
    };
  }

  async resetOwnerPassword(
    platformAdminId: string,
    organizationId: string,
    temporaryPassword: string,
    reason: string,
    metadata: Metadata,
  ) {
    const passwordHash = await hashPassword(temporaryPassword);
    return this.prisma.withPlatform(platformAdminId, async (tx) => {
      const owner = await tx.user.findFirst({
        where: { organizationId, roles: { some: { role: { key: "owner" } } } },
      });
      if (!owner)
        throw new NotFoundException({
          code: "OWNER_NOT_FOUND",
          message: "Business owner not found.",
        });
      await tx.user.update({
        where: { id: owner.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(Date.now() + 48 * 3600000),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.session.updateMany({
        where: { userId: owner.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId,
          actorType: "PLATFORM_ADMIN",
          actorId: platformAdminId,
          action: "owner.password_reset",
          entityType: "User",
          entityId: owner.id,
          reason,
          ...metadata,
        },
        tx,
      );
      return { success: true };
    });
  }

  async setModules(
    platformAdminId: string,
    organizationId: string,
    moduleIds: string[],
    metadata: Metadata,
  ) {
    return this.prisma.withPlatform(platformAdminId, async (tx) => {
      const modules = await tx.module.findMany({
        where: { id: { in: moduleIds }, isActive: true },
      });
      if (modules.length !== moduleIds.length)
        throw new BadRequestException({
          code: "INVALID_MODULE",
          message: "One or more modules are unavailable.",
        });
      const before = await tx.organizationModule.findMany({
        where: { organizationId },
        select: { moduleId: true },
      });
      await tx.organizationModule.deleteMany({ where: { organizationId } });
      if (moduleIds.length)
        await tx.organizationModule.createMany({
          data: moduleIds.map((moduleId) => ({ organizationId, moduleId })),
        });
      await this.audit.create(
        {
          organizationId,
          actorType: "PLATFORM_ADMIN",
          actorId: platformAdminId,
          action: "organization.modules_changed",
          entityType: "Organization",
          entityId: organizationId,
          beforeValue: before.map((item) => item.moduleId),
          afterValue: moduleIds,
          ...metadata,
        },
        tx,
      );
      return { success: true };
    });
  }

  async setSubscription(
    platformAdminId: string,
    organizationId: string,
    planId: string,
    endsAt: string | undefined,
    metadata: Metadata,
    reason: string,
  ) {
    if (!endsAt || new Date(endsAt) <= new Date())
      throw new BadRequestException(
        "A future expiry is required for a manual subscription exception.",
      );
    return this.prisma.withPlatform(platformAdminId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${organizationId}::uuid FOR UPDATE`;
      const plan = await tx.subscriptionPlan.findFirst({
        where: { id: planId, isActive: true },
      });
      if (!plan)
        throw new BadRequestException({
          code: "INVALID_PLAN",
          message: "Select an active plan.",
        });
      await tx.organizationSubscription.updateMany({
        where: { organizationId, status: { in: ["ACTIVE", "TRIALING"] } },
        data: { status: "CANCELED" },
      });
      const subscription = await tx.organizationSubscription.create({
        data: {
          organizationId,
          planId,
          status: "ACTIVE",
          startsAt: new Date(),
          endsAt: endsAt ? new Date(endsAt) : null,
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorType: "PLATFORM_ADMIN",
          actorId: platformAdminId,
          action: "organization.subscription_changed",
          reason,
          entityType: "OrganizationSubscription",
          entityId: subscription.id,
          afterValue: { planId, endsAt: endsAt ?? null },
          ...metadata,
        },
        tx,
      );
      return subscription;
    });
  }

  async createOrganization(
    input: CreateOrganizationInput,
    adminId: string,
    metadata: Metadata,
  ) {
    const derivedSlug =
      input.name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "business";
    const slug = `${derivedSlug}-${randomUUID().slice(0, 6)}`;
    const [plan, permissions, duplicateLogin] = await Promise.all([
      this.prisma.platform.subscriptionPlan.findUnique({
        where: { id: input.planId },
        include: { modules: { include: { module: true } } },
      }),
      this.prisma.platform.permission.findMany(),
      this.prisma.platform.user.findFirst({
        where: {
          OR: [
            { username: { equals: input.ownerUsername, mode: "insensitive" } },
            { email: { equals: input.email, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (!plan?.isActive)
      throw new BadRequestException({
        code: "INVALID_PLAN",
        message: "Select an active subscription plan.",
      });
    if (duplicateLogin)
      throw new ConflictException({
        code: "LOGIN_EXISTS",
        message:
          "That owner username or email is already registered. Use a different login.",
      });
    const selectedModuleIds = input.moduleIds.length
      ? input.moduleIds
      : plan.modules.map(({ moduleId }) => moduleId);
    const modules = await this.prisma.platform.module.findMany({
      where: { id: { in: selectedModuleIds }, isActive: true },
    });
    if (modules.length !== selectedModuleIds.length)
      throw new BadRequestException({
        code: "INVALID_MODULE",
        message: "One or more modules are unavailable.",
      });
    const passwordHash = await hashPassword(input.temporaryPassword);
    const startsAt = input.subscriptionStartsAt
      ? new Date(input.subscriptionStartsAt)
      : new Date();
    const endsAt = input.subscriptionEndsAt
      ? new Date(input.subscriptionEndsAt)
      : nextMonth(startsAt);
    if (endsAt <= startsAt)
      throw new BadRequestException(
        "Renewal date must be after the subscription start date.",
      );

    return this.prisma.withPlatform(adminId, async (tx) => {
      const organization = await tx.organization.create({
        data: {
          slug,
          name: input.name,
          businessType: input.businessType,
          email: input.email,
          phone: input.phone,
        },
      });
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
      await tx.organizationSubscription.create({
        data: {
          organizationId: organization.id,
          planId: plan.id,
          status: "ACTIVE",
          startsAt,
          endsAt,
          graceEndsAt: new Date(endsAt.getTime() + input.graceDays * 86400000),
        },
      });
      await tx.organizationModule.createMany({
        data: modules.map((module) => ({
          organizationId: organization.id,
          moduleId: module.id,
        })),
      });
      await tx.businessSetting.create({
        data: {
          organizationId: organization.id,
          timezone: input.timezone,
          currencyCode: input.currencyCode,
        },
      });
      await tx.paymentMethod.createMany({
        data: [
          {
            organizationId: organization.id,
            key: "cash",
            name: "Cash",
            type: "CASH",
            sortOrder: 1,
          },
          {
            organizationId: organization.id,
            key: "card",
            name: "Card",
            type: "CARD",
            sortOrder: 2,
          },
          {
            organizationId: organization.id,
            key: "bank",
            name: "Bank transfer",
            type: "BANK",
            sortOrder: 3,
          },
          {
            organizationId: organization.id,
            key: "jazzcash",
            name: "JazzCash",
            type: "MOBILE_WALLET",
            sortOrder: 4,
          },
          {
            organizationId: organization.id,
            key: "easypaisa",
            name: "Easypaisa",
            type: "MOBILE_WALLET",
            sortOrder: 5,
          },
          {
            organizationId: organization.id,
            key: "credit",
            name: "Credit / Khata",
            type: "CREDIT",
            sortOrder: 6,
          },
        ],
      });
      const roles = await Promise.all(
        Object.keys(DEFAULT_ROLES).map((key) =>
          tx.role.create({
            data: {
              organizationId: organization.id,
              key,
              name: key
                .split("_")
                .map((part) => part[0]?.toUpperCase() + part.slice(1))
                .join(" "),
              isSystem: true,
            },
          }),
        ),
      );
      for (const role of roles) {
        const allowed = DEFAULT_ROLES[role.key] ?? [];
        const grants = allowed.includes("*")
          ? permissions
          : permissions.filter((permission) =>
              allowed.includes(permission.key),
            );
        if (grants.length)
          await tx.rolePermission.createMany({
            data: grants.map((permission) => ({
              roleId: role.id,
              permissionId: permission.id,
            })),
          });
      }
      const ownerRole = roles.find((role) => role.key === "owner");
      if (!ownerRole) throw new Error("Owner role creation failed");
      const owner = await tx.user.create({
        data: {
          organizationId: organization.id,
          username: input.ownerUsername,
          email: input.email,
          name: input.ownerName,
          phone: input.phone,
          passwordHash,
          temporaryPasswordExpiresAt: new Date(Date.now() + 48 * 3600000),
        },
      });
      await tx.userRole.create({
        data: {
          organizationId: organization.id,
          userId: owner.id,
          roleId: ownerRole.id,
        },
      });
      const branch = await tx.branch.create({
        data: {
          organizationId: organization.id,
          name: input.initialBranchName,
          code: "MAIN",
          isPrimary: true,
          timezone: input.timezone,
        },
      });
      await tx.branchSetting.create({
        data: { organizationId: organization.id, branchId: branch.id },
      });
      await tx.branchMembership.create({
        data: {
          organizationId: organization.id,
          userId: owner.id,
          branchId: branch.id,
          isDefault: true,
        },
      });
      await this.audit.create(
        {
          organizationId: organization.id,
          actorType: "PLATFORM_ADMIN",
          actorId: adminId,
          action: "organization.created",
          entityType: "Organization",
          entityId: organization.id,
          afterValue: {
            name: organization.name,
            slug: organization.slug,
            ownerId: owner.id,
          },
          ...metadata,
        },
        tx,
      );
      return {
        id: organization.id,
        slug: organization.slug,
        ownerId: owner.id,
      };
    });
  }

  async changeStatus(
    id: string,
    status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED",
    adminId: string,
    reason: string | undefined,
    metadata: Metadata,
    expiresAt?: string,
  ) {
    if (!reason?.trim() || reason.trim().length < 3)
      throw new BadRequestException("A reason is required.");
    if (
      expiresAt &&
      (status !== "SUSPENDED" || new Date(expiresAt) <= new Date())
    )
      throw new BadRequestException("Suspension expiry must be a future date.");
    return this.prisma.withPlatform(adminId, async (tx) => {
      const current = await tx.organization.findUnique({
        where: { id },
      });
      if (!current)
        throw new NotFoundException({
          code: "NOT_FOUND",
          message: "Business not found.",
        });
      const updated = await tx.organization.update({
        where: { id },
        data: {
          status,
          statusExpiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });
      await this.audit.create(
        {
          organizationId: id,
          actorType: "PLATFORM_ADMIN",
          actorId: adminId,
          action: `organization.${status.toLowerCase()}`,
          entityType: "Organization",
          entityId: id,
          beforeValue: { status: current.status },
          afterValue: { status, expiresAt: expiresAt ?? null },
          reason,
          ...metadata,
        },
        tx,
      );
      return updated;
    });
  }
}
