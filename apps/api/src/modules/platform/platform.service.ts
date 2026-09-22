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
    const admin = await this.prisma.platformAdmin.findUnique({
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
    const session = await this.prisma.platformSession.create({
      data: {
        platformAdminId: admin.id,
        tokenHash: sha256(token),
        csrfHash: sha256(csrfToken),
        expiresAt,
        ...metadata,
      },
    });
    await this.prisma.platformAdmin.update({
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
    await this.prisma.platformSession.updateMany({
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
      this.prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.module.findMany({
        where: { isActive: true, phase: 1 },
        orderBy: { name: "asc" },
      }),
    ]);
    return { plans, modules };
  }

  listOrganizations(platformAdminId: string, cursor?: string, take = 25) {
    const size = Math.min(Math.max(take, 1), 100);
    return this.prisma
      .withPlatform(platformAdminId, (tx) =>
        tx.organization.findMany({
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
        }),
      )
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
  ) {
    return this.prisma.withPlatform(platformAdminId, async (tx) => {
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
      this.prisma.subscriptionPlan.findUnique({
        where: { id: input.planId },
        include: { modules: { include: { module: true } } },
      }),
      this.prisma.permission.findMany(),
      this.prisma.user.findFirst({
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
    const modules = await this.prisma.module.findMany({
      where: { id: { in: selectedModuleIds }, isActive: true },
    });
    if (modules.length !== selectedModuleIds.length)
      throw new BadRequestException({
        code: "INVALID_MODULE",
        message: "One or more modules are unavailable.",
      });
    const passwordHash = await hashPassword(input.temporaryPassword);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE cafe_pos_app");
      await tx.$executeRaw`SELECT set_config('app.platform_admin_id', ${adminId}, true)`;
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
          startsAt: new Date(),
          endsAt: input.subscriptionEndsAt
            ? new Date(input.subscriptionEndsAt)
            : null,
        },
      });
      await tx.organizationModule.createMany({
        data: modules.map((module) => ({
          organizationId: organization.id,
          moduleId: module.id,
        })),
      });
      await tx.businessSetting.create({
        data: { organizationId: organization.id },
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
        },
      });
      await tx.userRole.create({
        data: {
          organizationId: organization.id,
          userId: owner.id,
          roleId: ownerRole.id,
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
  ) {
    const current = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!current)
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Business not found.",
      });
    const updated = await this.prisma.organization.update({
      where: { id },
      data: { status },
    });
    if (status !== "ACTIVE")
      await this.prisma.session.updateMany({
        where: { organizationId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    await this.audit.create({
      organizationId: id,
      actorType: "PLATFORM_ADMIN",
      actorId: adminId,
      action: `organization.${status.toLowerCase()}`,
      entityType: "Organization",
      entityId: id,
      beforeValue: { status: current.status },
      afterValue: { status },
      reason,
      ...metadata,
    });
    return updated;
  }
}
