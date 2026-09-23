import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BranchInput } from "@cafe-pos/contracts";
import { Prisma } from "@prisma/client";
import { hashPassword } from "../../common/security";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../audit/audit.service";

interface Actor {
  organizationId: string;
  userId: string;
  sessionId?: string;
}
interface Metadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  organization(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        include: {
          businessSettings: true,
          modules: { include: { module: true } },
          subscriptions: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: { plan: true },
          },
          _count: {
            select: {
              branches: true,
              users: true,
              devices: { where: { revokedAt: null } },
            },
          },
        },
      }),
    );
  }

  branches(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.branch.findMany({
        where: { organizationId },
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      }),
    );
  }

  async createBranch(actor: Actor, input: BranchInput, metadata: Metadata) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const [count, subscription] = await Promise.all([
        tx.branch.count({
          where: { organizationId: actor.organizationId, isActive: true },
        }),
        tx.organizationSubscription.findFirst({
          where: {
            organizationId: actor.organizationId,
            status: { in: ["ACTIVE", "TRIALING"] },
          },
          orderBy: { createdAt: "desc" },
          include: { plan: true },
        }),
      ]);
      if (!subscription || count >= subscription.plan.maxBranches)
        throw new BadRequestException({
          code: "BRANCH_LIMIT",
          message: "The subscription branch limit has been reached.",
        });
      if (input.isPrimary)
        await tx.branch.updateMany({
          where: { organizationId: actor.organizationId },
          data: { isPrimary: false },
        });
      try {
        const branch = await tx.branch.create({
          data: { organizationId: actor.organizationId, ...input },
        });
        await tx.branchSetting.create({
          data: { organizationId: actor.organizationId, branchId: branch.id },
        });
        await tx.branchMembership.create({
          data: {
            organizationId: actor.organizationId,
            branchId: branch.id,
            userId: actor.userId,
            isDefault: input.isPrimary,
          },
        });
        await this.audit.create(
          {
            organizationId: actor.organizationId,
            branchId: branch.id,
            userId: actor.userId,
            actorType: "USER",
            actorId: actor.userId,
            action: "branch.created",
            entityType: "Branch",
            entityId: branch.id,
            afterValue: { name: branch.name, code: branch.code },
            ...metadata,
          },
          tx,
        );
        return branch;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new ConflictException({
            code: "BRANCH_CODE_EXISTS",
            message: "That branch code already exists.",
          });
        throw error;
      }
    });
  }

  async updateBusiness(
    actor: Actor,
    input: {
      name: string;
      businessType: string;
      logoUrl?: string | null;
      phone?: string;
    },
    metadata: Metadata,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({
        where: { id: actor.organizationId },
      });
      const organization = await tx.organization.update({
        where: { id: actor.organizationId },
        data: {
          ...input,
          onboardingStep: { set: Math.max(before.onboardingStep, 1) },
        },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "onboarding.business_updated",
          entityType: "Organization",
          entityId: actor.organizationId,
          beforeValue: { name: before.name, businessType: before.businessType },
          afterValue: {
            name: organization.name,
            businessType: organization.businessType,
          },
          ...metadata,
        },
        tx,
      );
      return organization;
    });
  }

  async updateSettings(
    actor: Actor,
    input: Record<string, unknown>,
    metadata: Metadata,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const before = await tx.businessSetting.findUnique({
        where: { organizationId: actor.organizationId },
      });
      const data = input as Prisma.BusinessSettingUpdateInput;
      const settings = await tx.businessSetting.update({
        where: { organizationId: actor.organizationId },
        data,
      });
      await tx.organization.update({
        where: { id: actor.organizationId },
        data: { onboardingStep: { set: 2 } },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "settings.updated",
          entityType: "BusinessSetting",
          entityId: settings.id,
          beforeValue: before as unknown as Prisma.InputJsonValue,
          afterValue: settings as unknown as Prisma.InputJsonValue,
          ...metadata,
        },
        tx,
      );
      return settings;
    });
  }

  async completeOnboarding(actor: Actor, metadata: Metadata) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const branchCount = await tx.branch.count({
        where: { organizationId: actor.organizationId, isActive: true },
      });
      if (!branchCount)
        throw new BadRequestException({
          code: "BRANCH_REQUIRED",
          message: "Create at least one branch before finishing setup.",
        });
      const organization = await tx.organization.update({
        where: { id: actor.organizationId },
        data: { onboardingStep: 10, onboardingCompletedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "onboarding.completed",
          entityType: "Organization",
          entityId: actor.organizationId,
          ...metadata,
        },
        tx,
      );
      return organization;
    });
  }

  users(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.user.findMany({
        where: { organizationId },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          phone: true,
          status: true,
          mustChangePassword: true,
          roles: {
            select: { role: { select: { id: true, key: true, name: true } } },
          },
          branchMemberships: {
            select: { branch: { select: { id: true, name: true } } },
          },
        },
        orderBy: { name: "asc" },
      }),
    );
  }

  async createUser(actor: Actor, input: any, metadata: Metadata) {
    await this.requireOwner(actor);
    const duplicateLogin =
      (await this.prisma.identity(input.username)) ||
      (input.email ? await this.prisma.identity(input.email) : null);
    if (duplicateLogin)
      throw new ConflictException({
        code: "USER_EXISTS",
        message:
          "That username or email is already registered. Choose a different login.",
      });
    const passwordHash = await hashPassword(input.temporaryPassword);
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const [count, subscription, roles, branches] = await Promise.all([
        tx.user.count({
          where: {
            organizationId: actor.organizationId,
            status: { not: "DEACTIVATED" },
          },
        }),
        tx.organizationSubscription.findFirst({
          where: {
            organizationId: actor.organizationId,
            status: { in: ["ACTIVE", "TRIALING"] },
          },
          orderBy: { createdAt: "desc" },
          include: { plan: true },
        }),
        tx.role.findMany({
          where: {
            organizationId: actor.organizationId,
            id: { in: input.roleIds },
          },
        }),
        tx.branch.findMany({
          where: {
            organizationId: actor.organizationId,
            id: { in: input.branchIds },
            isActive: true,
          },
        }),
      ]);
      if (!subscription || count >= subscription.plan.maxUsers)
        throw new BadRequestException({
          code: "USER_LIMIT",
          message: "The subscription user limit has been reached.",
        });
      if (
        roles.length !== input.roleIds.length ||
        branches.length !== input.branchIds.length
      )
        throw new BadRequestException({
          code: "INVALID_SCOPE",
          message: "Select roles and branches from this business.",
        });
      if (roles.some(role => role.key === 'owner')) throw new ForbiddenException('Owner role assignment requires an ownership workflow.');
      try {
        const user = await tx.user.create({
          data: {
            organizationId: actor.organizationId,
            username: input.username,
            email: input.email,
            name: input.name,
            phone: input.phone,
            passwordHash,
            temporaryPasswordExpiresAt: new Date(Date.now() + 48 * 3600000),
          },
        });
        await tx.userRole.createMany({
          data: roles.map((role) => ({
            organizationId: actor.organizationId,
            userId: user.id,
            roleId: role.id,
          })),
        });
        await tx.branchMembership.createMany({
          data: branches.map((branch, index) => ({
            organizationId: actor.organizationId,
            userId: user.id,
            branchId: branch.id,
            isDefault: index === 0,
          })),
        });
        await this.audit.create(
          {
            organizationId: actor.organizationId,
            userId: actor.userId,
            actorType: "USER",
            actorId: actor.userId,
            action: "user.created",
            entityType: "User",
            entityId: user.id,
            afterValue: {
              username: user.username,
              roleIds: input.roleIds,
              branchIds: input.branchIds,
            },
            ...metadata,
          },
          tx,
        );
        return {
          id: user.id,
          username: user.username,
          name: user.name,
          mustChangePassword: true,
        };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new ConflictException({
            code: "USER_EXISTS",
            message:
              "That username or email is already registered. Choose a different login.",
          });
        throw error;
      }
    });
  }

  roles(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.role.findMany({
        where: { organizationId },
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { users: true } },
        },
        orderBy: { name: "asc" },
      }),
    );
  }

  permissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ moduleKey: "asc" }, { key: "asc" }],
    });
  }

  private async requireOwner(actor: Actor) {
    const owner = await this.prisma.withTenant(actor.organizationId, (tx) =>
      tx.userRole.findFirst({
        where: { userId: actor.userId, role: { key: "owner" } },
      }),
    );
    if (!owner)
      throw new ForbiddenException(
        "Only the business owner can change staff access in this phase.",
      );
  }

  devices(actor: Actor) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const [currentSession, subscription, devices] = await Promise.all([
        actor.sessionId
          ? tx.session.findUnique({
              where: { id: actor.sessionId },
              select: { deviceId: true },
            })
          : null,
        tx.organizationSubscription.findFirst({
          where: {
            organizationId: actor.organizationId,
            status: { in: ["ACTIVE", "TRIALING"] },
          },
          orderBy: { createdAt: "desc" },
          include: { plan: true },
        }),
        tx.organizationDevice.findMany({
          where: { organizationId: actor.organizationId, revokedAt: null, leaseExpiresAt: { gt: new Date() } },
          orderBy: { lastSeenAt: "desc" },
          include: {
            sessions: {
              where: { revokedAt: null },
              orderBy: { lastSeenAt: "desc" },
              take: 1,
              select: { user: { select: { name: true } } },
            },
          },
        }),
      ]);
      return {
        maxDevices: subscription?.plan.maxDevices ?? 0,
        items: devices.map((device) => ({
          id: device.id,
          displayName: device.displayName,
          firstSeenAt: device.firstSeenAt,
          lastSeenAt: device.lastSeenAt,
          lastIpAddress: device.lastIpAddress,
          current: device.id === currentSession?.deviceId,
          lastUserName: device.sessions[0]?.user.name ?? null,
        })),
      };
    });
  }

  async revokeDevice(actor: Actor, deviceId: string, metadata: Metadata) {
    await this.requireOwner(actor);
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const device = await tx.organizationDevice.findFirst({
        where: {
          id: deviceId,
          organizationId: actor.organizationId,
          revokedAt: null,
        },
      });
      if (!device)
        throw new NotFoundException({
          code: "DEVICE_NOT_FOUND",
          message: "Device not found or already removed.",
        });
      await tx.organizationDevice.update({
        where: { id: device.id },
        data: { revokedAt: new Date() },
      });
      await tx.session.updateMany({
        where: {
          organizationId: actor.organizationId,
          deviceId: device.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "device.revoked",
          entityType: "OrganizationDevice",
          entityId: device.id,
          afterValue: { displayName: device.displayName },
          ...metadata,
        },
        tx,
      );
      return {
        success: true,
        currentSessionRevoked: actor.sessionId
          ? Boolean(
              await tx.session.findFirst({
                where: { id: actor.sessionId, deviceId: device.id },
              }),
            )
          : false,
      };
    });
  }

  async recoverDevices(actor: Actor, metadata: Metadata) {
    await this.requireOwner(actor);
    return this.prisma.withTenant(actor.organizationId, async tx=>{
      const count=await tx.organizationDevice.updateMany({where:{organizationId:actor.organizationId,revokedAt:null},data:{leaseExpiresAt:new Date()}});
      await this.audit.create({organizationId:actor.organizationId,userId:actor.userId,actorType:'USER',actorId:actor.userId,action:'device.pool_recovered',entityType:'OrganizationDevice',reason:'Owner requested device lease recovery',afterValue:{released:count.count},...metadata},tx);
      return {success:true,released:count.count};
    });
  }

  async createRole(actor:Actor,input:{key:string;name:string;description?:string;permissionIds:string[];scope?:unknown;approvalLimitMinor?:number},metadata:Metadata){
    await this.requireOwner(actor);
    return this.prisma.withTenant(actor.organizationId,async tx=>{
      if(input.key==='owner')throw new ForbiddenException('The owner role is protected.');
      const permissions=await tx.permission.findMany({where:{id:{in:input.permissionIds}}});
      if(permissions.length!==new Set(input.permissionIds).size)throw new BadRequestException('Select valid permissions.');
      const role=await tx.role.create({data:{organizationId:actor.organizationId,key:input.key,name:input.name,description:input.description,scope:input.scope??{},approvalLimitMinor:input.approvalLimitMinor,permissions:{create:input.permissionIds.map(permissionId=>({permissionId}))}}});
      await this.audit.create({organizationId:actor.organizationId,userId:actor.userId,actorType:'USER',actorId:actor.userId,action:'role.created',entityType:'Role',entityId:role.id,afterValue:{key:role.key,permissionIds:input.permissionIds,scope:input.scope??{}} ,...metadata},tx);
      return role;
    });
  }

  async assignRoles(actor:Actor,userId:string,roleIds:string[],branchIds:string[],metadata:Metadata){
    await this.requireOwner(actor);
    return this.prisma.withTenant(actor.organizationId,async tx=>{
      const target=await tx.user.findFirst({where:{id:userId,organizationId:actor.organizationId},include:{roles:{include:{role:true}}}});
      if(!target)throw new NotFoundException('User not found.');
      const roles=await tx.role.findMany({where:{organizationId:actor.organizationId,id:{in:roleIds}}});
      if(roles.length!==new Set(roleIds).size || roles.some(role=>role.key==='owner'))throw new ForbiddenException('Owner authority cannot be delegated.');
      const branches=await tx.branch.findMany({where:{organizationId:actor.organizationId,id:{in:branchIds},isActive:true}});
      if(branches.length!==new Set(branchIds).size)throw new BadRequestException('Invalid branch scope.');
      const wasOwner=target.roles.some(item=>item.role.key==='owner');
      if(wasOwner)throw new ForbiddenException('The last owner cannot be reassigned in this workflow.');
      await tx.userRole.deleteMany({where:{organizationId:actor.organizationId,userId}});
      await tx.userRole.createMany({data:roles.map(role=>({organizationId:actor.organizationId,userId,roleId:role.id}))});
      await tx.branchMembership.deleteMany({where:{organizationId:actor.organizationId,userId}});
      await tx.branchMembership.createMany({data:branches.map((branch,index)=>({organizationId:actor.organizationId,userId,branchId:branch.id,isDefault:index===0}))});
      await this.audit.create({organizationId:actor.organizationId,userId:actor.userId,actorType:'USER',actorId:actor.userId,action:'user.roles_changed',entityType:'User',entityId:userId,beforeValue:{roleIds:target.roles.map(item=>item.roleId)},afterValue:{roleIds,branchIds},...metadata},tx);
      return {success:true};
    });
  }

  async requestApproval(actor: Actor, input: { action: string; payloadHash: string; amountMinor?: number; expiresInSeconds?: number }, metadata: Metadata) {
    const ttl = Math.min(Math.max(input.expiresInSeconds ?? 300, 30), 3600);
    if (!/^[a-f0-9]{64}$/i.test(input.payloadHash))
      throw new BadRequestException("payloadHash must be a SHA-256 hash.");
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const challenge = await tx.approvalChallenge.create({
        data: {
          organizationId: actor.organizationId,
          action: input.action,
          payloadHash: input.payloadHash.toLowerCase(),
          amountMinor: input.amountMinor,
          requestedById: actor.userId,
          expiresAt: new Date(Date.now() + ttl * 1000),
        },
      });
      await this.audit.create({ organizationId: actor.organizationId, userId: actor.userId, actorType: "USER", actorId: actor.userId, action: "approval.requested", entityType: "ApprovalChallenge", entityId: challenge.id, afterValue: { action: challenge.action, amountMinor: challenge.amountMinor }, ...metadata }, tx);
      return { id: challenge.id, action: challenge.action, expiresAt: challenge.expiresAt, status: "PENDING" };
    });
  }

  async consumeApproval(actor: Actor, id: string, payloadHash: string, metadata: Metadata) {
    await this.requireOwner(actor);
    if (!/^[a-f0-9]{64}$/i.test(payloadHash)) throw new BadRequestException("payloadHash must be a SHA-256 hash.");
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const now = new Date();
      const challenge = await tx.approvalChallenge.findFirst({ where: { id, organizationId: actor.organizationId } });
      if (!challenge) throw new NotFoundException("Approval challenge not found.");
      if (challenge.payloadHash !== payloadHash.toLowerCase()) throw new ForbiddenException("Approval payload does not match.");
      if (challenge.consumedAt || challenge.expiresAt <= now) throw new ConflictException("Approval challenge is no longer valid.");
      const updated = await tx.approvalChallenge.updateMany({ where: { id, organizationId: actor.organizationId, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now, approvedById: actor.userId } });
      if (updated.count !== 1) throw new ConflictException("Approval challenge was already consumed.");
      await this.audit.create({ organizationId: actor.organizationId, userId: actor.userId, actorType: "USER", actorId: actor.userId, action: "approval.consumed", entityType: "ApprovalChallenge", entityId: id, ...metadata }, tx);
      return { success: true, id, consumedAt: now };
    });
  }

  async setRolePermissions(
    actor: Actor,
    roleId: string,
    permissionIds: string[],
    metadata: Metadata,
  ) {
    await this.requireOwner(actor);
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, organizationId: actor.organizationId },
      });
      if (!role)
        throw new NotFoundException({
          code: "NOT_FOUND",
          message: "Role not found.",
        });
      if (role.key === "owner")
        throw new ForbiddenException("Owner permissions cannot be edited.");
      const permissions = await tx.permission.findMany({
        where: { id: { in: permissionIds } },
      });
      if (permissions.length !== permissionIds.length)
        throw new BadRequestException({
          code: "INVALID_PERMISSION",
          message: "One or more permissions do not exist.",
        });
      const before = await tx.rolePermission.findMany({
        where: { roleId },
        select: { permissionId: true },
      });
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length)
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "role.permissions_changed",
          entityType: "Role",
          entityId: roleId,
          beforeValue: before.map((item) => item.permissionId),
          afterValue: permissionIds,
          ...metadata,
        },
        tx,
      );
      return { success: true };
    });
  }
}
