import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { sha256 } from "../../common/security";
import { nextMonth, outstanding } from "./billing.rules";
import { randomUUID } from "node:crypto";

export const planVersionSchema = z.object({
  planId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  currency: z.string().regex(/^[A-Z]{3}$/),
  monthlyMinor: z.number().int().min(0).max(1000000000),
  maxBranches: z.number().int().min(1).max(10000),
  maxUsers: z.number().int().min(1).max(100000),
  maxDevices: z.number().int().min(1).max(10000),
  graceDays: z.number().int().min(0).max(90),
  moduleIds: z.array(z.string().uuid()).min(1).optional(),
});
export const invoiceSchema = z.object({
  commandId: z.string().uuid(),
  planVersionId: z.string().uuid(),
  startsAt: z.string().datetime().optional(),
});
export const settlementSchema = z.object({
  commandId: z.string().uuid(),
  kind: z.enum(["PAYMENT", "CREDIT"]),
  amountMinor: z.number().int().positive().max(1000000000),
  method: z.enum([
    "CASH",
    "BANK_TRANSFER",
    "JAZZCASH",
    "EASYPAISA",
    "ADJUSTMENT",
  ]),
  reference: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3).max(1000),
});
export const attachmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .regex(/^[\w .()-]+$/),
  mimeType: z.enum(["image/png", "image/jpeg", "application/pdf"]),
  base64: z
    .string()
    .min(1)
    .max(2796204)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  plans(adminId: string) {
    return this.prisma
      .withPlatform(adminId, (tx) =>
        tx.subscriptionPlan.findMany({
          where: { NOT: { code: { startsWith: "period-" } } },
          orderBy: { name: "asc" },
        }),
      )
      .then(async (plans) => ({
        plans,
        modules: await this.prisma.module.findMany({
          where: { isActive: true, phase: 1 },
          select: { id: true, name: true },
        }),
        versions: await this.prisma.withPlatform(adminId, (tx) =>
          tx.billingPlanVersion.findMany({ orderBy: { createdAt: "desc" } }),
        ),
      }));
  }

  createVersion(adminId: string, input: z.infer<typeof planVersionSchema>) {
    return this.prisma.withPlatform(adminId, async (tx) => {
      const plan = input.planId
        ? await tx.subscriptionPlan.findUnique({ where: { id: input.planId } })
        : await tx.subscriptionPlan.create({
            data: {
              code: `custom-${randomUUID()}`,
              name: input.name,
              maxBranches: input.maxBranches,
              maxUsers: input.maxUsers,
              maxDevices: input.maxDevices,
            },
          });
      if (!plan) throw new NotFoundException("Plan not found.");
      if (!plan.isActive)
        throw new BadRequestException(
          "Reactivate the plan before publishing a price.",
        );
      const modules = await tx.module.findMany({
        where: {
          isActive: true,
          phase: 1,
          ...(input.moduleIds ? { id: { in: input.moduleIds } } : {}),
        },
      });
      if (input.moduleIds && modules.length !== new Set(input.moduleIds).size)
        throw new BadRequestException("Select available modules only.");
      const moduleIds = modules.map((module) => module.id);
      const version = await tx.billingPlanVersion.create({
        data: { ...input, planId: plan.id, moduleIds },
      });
      if (!input.planId && moduleIds.length)
        await tx.planModule.createMany({
          data: moduleIds.map((moduleId) => ({ planId: plan.id, moduleId })),
        });
      // Existing plan limits remain unchanged. A version takes effect only on explicit renewal.
      await this.audit.create(
        {
          actorType: "PLATFORM_ADMIN",
          actorId: adminId,
          action: "billing.plan_version_created",
          entityType: "BillingPlanVersion",
          entityId: version.id,
          afterValue: input,
        },
        tx,
      );
      return version;
    });
  }

  setPlanActive(adminId: string, planId: string, isActive: boolean) {
    return this.prisma.withPlatform(adminId, async (tx) => {
      const plan = await tx.subscriptionPlan.findUnique({
        where: { id: planId },
      });
      if (!plan || plan.code.startsWith("period-"))
        throw new NotFoundException("Editable plan not found.");
      await tx.subscriptionPlan.update({
        where: { id: planId },
        data: { isActive },
      });
      await this.audit.create(
        {
          actorType: "PLATFORM_ADMIN",
          actorId: adminId,
          action: "billing.plan_status_changed",
          entityType: "SubscriptionPlan",
          entityId: planId,
          beforeValue: { isActive: plan.isActive },
          afterValue: { isActive },
        },
        tx,
      );
      return { success: true };
    });
  }

  metrics(adminId: string) {
    return this.prisma.withPlatform(adminId, async (tx) => {
      const invoices = await tx.billingInvoice.findMany({
        include: { settlements: true },
      });
      const subscriptions = await tx.organizationSubscription.findMany({
        where: {
          status: { in: ["ACTIVE", "TRIALING"] },
          organization: { status: "ACTIVE" },
          endsAt: { gt: new Date() },
        },
        include: { plan: true },
      });
      const activeInvoiceIds = new Set(
        subscriptions.map((s) => s.plan.code.replace(/^period-/, "")),
      );
      const currencies: Record<
        string,
        {
          collectionsMinor: number;
          creditsMinor: number;
          outstandingMinor: number;
          monthlyRecurringMinor: number;
        }
      > = {};
      let overdueInvoices = 0;
      for (const invoice of invoices) {
        const group = (currencies[invoice.currency] ??= {
          collectionsMinor: 0,
          creditsMinor: 0,
          outstandingMinor: 0,
          monthlyRecurringMinor: 0,
        });
        for (const entry of invoice.settlements)
          if (entry.kind === "PAYMENT")
            group.collectionsMinor += entry.amountMinor;
          else group.creditsMinor += entry.amountMinor;
        const due = outstanding(invoice.totalMinor, invoice.settlements);
        group.outstandingMinor += due;
        if (due > 0 && invoice.periodStart <= new Date()) overdueInvoices++;
        if (activeInvoiceIds.has(invoice.id))
          group.monthlyRecurringMinor += invoice.totalMinor;
      }
      return {
        currencies,
        overdueInvoices,
        definition:
          "Collections are all recorded manual payments, excluding credits. Monthly recurring amount covers currently active paid invoice periods only; unpriced legacy subscriptions are excluded.",
      };
    });
  }

  downgradePreview(adminId:string,organizationId:string,planId:string){
    return this.prisma.withPlatform(adminId,async tx=>{
      const plan=await tx.subscriptionPlan.findFirst({where:{id:planId,isActive:true}});if(!plan)throw new NotFoundException('Plan not found.');
      const [branches,users,devices,modules]=await Promise.all([
        tx.branch.findMany({where:{organizationId,isActive:true},select:{id:true,name:true}}),
        tx.user.findMany({where:{organizationId,status:'ACTIVE'},select:{id:true,name:true}}),
        tx.organizationDevice.findMany({where:{organizationId,revokedAt:null,leaseExpiresAt:{gt:new Date()}},select:{id:true,displayName:true}}),
        tx.organizationModule.findMany({where:{organizationId},include:{module:true}}),
      ]);
      return {plan:{id:plan.id,name:plan.name,maxBranches:plan.maxBranches,maxUsers:plan.maxUsers,maxDevices:plan.maxDevices},conflicts:{branches:branches.length>plan.maxBranches?branches:[],users:users.length>plan.maxUsers?users:[],devices:devices.length>plan.maxDevices?devices:[],modules:modules.filter(item=>item.module.phase>1).map(item=>({id:item.moduleId,name:item.module.name}))},usage:{branches:branches.length,users:users.length,devices:devices.length}};
    });
  }

  async summary(organizationId: string, adminId?: string) {
    const work = async (
      tx: import("../../database/prisma.service").TransactionClient,
    ) => {
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          status: true,
          email: true,
          phone: true,
          subscriptions: {
            orderBy: { createdAt: "desc" },
            include: { plan: true },
          },
        },
      });
      if (!organization) throw new NotFoundException("Business not found.");
      const invoices = await tx.billingInvoice.findMany({
        where: { organizationId },
        include: { settlements: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
      const attachments = await tx.billingAttachment.findMany({
        where: { organizationId },
        select: { id: true, invoiceId: true, name: true, mimeType: true },
      });
      return {
        organization,
        invoices: invoices.map((invoice) => ({
          ...invoice,
          attachments: attachments.filter(
            (file) => file.invoiceId === invoice.id,
          ),
          outstandingMinor: outstanding(
            invoice.totalMinor,
            invoice.settlements,
          ),
        })),
      };
    };
    return adminId
      ? this.prisma.withPlatform(adminId, work)
      : this.prisma.withTenant(organizationId, work);
  }

  upload(
    adminId: string,
    organizationId: string,
    invoiceId: string,
    input: z.infer<typeof attachmentSchema>,
  ) {
    const content = Buffer.from(input.base64, "base64");
    const valid =
      input.mimeType === "application/pdf"
        ? content.subarray(0, 5).toString() === "%PDF-"
        : input.mimeType === "image/png"
          ? content
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : content[0] === 255 && content[1] === 216 && content[2] === 255;
    if (!valid || content.length > 2097152 || !content.length)
      throw new BadRequestException(
        "Upload a valid PDF, PNG or JPEG up to 2 MB.",
      );
    return this.prisma.withPlatform(adminId, async (tx) => {
      if (
        !(await tx.billingInvoice.findFirst({
          where: { id: invoiceId, organizationId },
        }))
      )
        throw new NotFoundException("Invoice not found.");
      const file = await tx.billingAttachment.create({
        data: {
          organizationId,
          invoiceId,
          name: input.name,
          mimeType: input.mimeType,
          content,
        },
        select: { id: true, name: true },
      });
      await this.audit.create(
        {
          organizationId,
          actorType: "PLATFORM_ADMIN",
          actorId: adminId,
          action: "billing.evidence_attached",
          entityType: "BillingAttachment",
          entityId: file.id,
          afterValue: { invoiceId },
        },
        tx,
      );
      return file;
    });
  }

  download(organizationId: string, fileId: string, adminId?: string) {
    const work = async (
      tx: import("../../database/prisma.service").TransactionClient,
    ) => {
      const file = await tx.billingAttachment.findFirst({
        where: { id: fileId, organizationId },
      });
      if (!file) throw new NotFoundException("Attachment not found.");
      return file;
    };
    return adminId
      ? this.prisma.withPlatform(adminId, work)
      : this.prisma.withTenant(organizationId, work);
  }

  issue(
    adminId: string,
    organizationId: string,
    input: z.infer<typeof invoiceSchema>,
  ) {
    return this.prisma.withPlatform(adminId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const requestHash = sha256(JSON.stringify(input));
      const previous = await tx.billingInvoice.findUnique({
        where: {
          organizationId_commandId: {
            organizationId,
            commandId: input.commandId,
          },
        },
      });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ConflictException(
            "This request ID was already used with different details.",
          );
        return previous;
      }
      const version = await tx.billingPlanVersion.findUnique({
        where: { id: input.planVersionId },
      });
      if (!version) throw new NotFoundException("Plan version not found.");
      const issuingPlan = await tx.subscriptionPlan.findUnique({
        where: { id: version.planId },
      });
      if (!issuingPlan?.isActive)
        throw new BadRequestException(
          "This plan is inactive. Choose an active plan.",
        );
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
      });
      if (!organization) throw new NotFoundException("Business not found.");
      const last = await tx.billingInvoice.findFirst({
        where: { organizationId },
        orderBy: { periodEnd: "desc" },
      });
      const start = input.startsAt
        ? new Date(input.startsAt)
        : (last?.periodEnd ?? new Date());
      if (last && start < last.periodEnd)
        throw new ConflictException("Billing periods cannot overlap.");
      const anchorDay = last?.anchorDay ?? start.getUTCDate();
      const end = nextMonth(start, anchorDay);
      const graceEndsAt = new Date(
        end.getTime() + version.graceDays * 86400000,
      );
      const invoice = await tx.billingInvoice.create({
        data: {
          organizationId,
          commandId: input.commandId,
          requestHash,
          planVersionId: version.id,
          description: `${version.name} — monthly subscription`,
          currency: version.currency,
          totalMinor: version.monthlyMinor,
          periodStart: start,
          periodEnd: end,
          graceEndsAt,
          anchorDay,
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorType: "PLATFORM_ADMIN",
          actorId: adminId,
          action: "billing.invoice_issued",
          entityType: "BillingInvoice",
          entityId: invoice.id,
          afterValue: {
            totalMinor: invoice.totalMinor,
            currency: invoice.currency,
          },
        },
        tx,
      );
      return invoice;
    });
  }

  settle(
    adminId: string,
    organizationId: string,
    invoiceId: string,
    input: z.infer<typeof settlementSchema>,
  ) {
    return this.prisma.withPlatform(adminId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const requestHash = sha256(JSON.stringify({ invoiceId, ...input }));
      const previous = await tx.billingSettlement.findUnique({
        where: {
          organizationId_commandId: {
            organizationId,
            commandId: input.commandId,
          },
        },
      });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ConflictException(
            "This request ID was already used with different details.",
          );
        return previous;
      }
      const invoice = await tx.billingInvoice.findFirst({
        where: { id: invoiceId, organizationId },
        include: { settlements: true },
      });
      if (!invoice) throw new NotFoundException("Invoice not found.");
      if (
        input.amountMinor > outstanding(invoice.totalMinor, invoice.settlements)
      )
        throw new BadRequestException(
          "The amount exceeds the invoice balance.",
        );
      if ((input.kind === "CREDIT") !== (input.method === "ADJUSTMENT"))
        throw new BadRequestException(
          "Credits must use the adjustment method.",
        );
      const settlement = await tx.billingSettlement.create({
        data: { ...input, organizationId, invoiceId, requestHash },
      });
      await this.audit.create(
        {
          organizationId,
          actorType: "PLATFORM_ADMIN",
          actorId: adminId,
          action: `billing.manual_${input.kind.toLowerCase()}`,
          entityType: "BillingSettlement",
          entityId: settlement.id,
          reason: input.reason,
          afterValue: {
            invoiceId,
            amountMinor: input.amountMinor,
            method: input.method,
            reference: input.reference,
          },
        },
        tx,
      );
      return settlement;
    });
  }

  renew(adminId: string, organizationId: string, invoiceId: string) {
    return this.prisma.withPlatform(adminId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const invoice = await tx.billingInvoice.findFirst({
        where: { id: invoiceId, organizationId },
        include: { settlements: true },
      });
      if (!invoice) throw new NotFoundException("Invoice not found.");
      if (outstanding(invoice.totalMinor, invoice.settlements) !== 0)
        throw new BadRequestException(
          "Settle the invoice before activating this period.",
        );
      const version = await tx.billingPlanVersion.findUniqueOrThrow({
        where: { id: invoice.planVersionId },
      });
      const current = await tx.organizationSubscription.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      });
      if (current && current.endsAt && current.endsAt >= invoice.periodEnd)
        return current;
      if (invoice.periodStart > new Date())
        throw new BadRequestException(
          "This period has not started yet. Activate it on its start date.",
        );
      const [branches, users, devices] = await Promise.all([
        tx.branch.count({ where: { organizationId, isActive: true } }),
        tx.user.count({ where: { organizationId, status: "ACTIVE" } }),
        tx.organizationDevice.count({
          where: { organizationId, revokedAt: null },
        }),
      ]);
      if (
        branches > version.maxBranches ||
        users > version.maxUsers ||
        devices > version.maxDevices
      )
        throw new ConflictException(
          "Plan limits are below current usage. Resolve branch, user and device conflicts before renewal.",
        );
      // Snapshot limits on a subscription-specific plan; editing a price never changes existing entitlements.
      const plan = await tx.subscriptionPlan.create({
        data: {
          code: `period-${invoice.id}`,
          name: version.name,
          maxBranches: version.maxBranches,
          maxUsers: version.maxUsers,
          maxDevices: version.maxDevices,
          isActive: false,
        },
      });
      await tx.organizationSubscription.updateMany({
        where: {
          organizationId,
          status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
        },
        data: { status: "CANCELED" },
      });
      const subscription = await tx.organizationSubscription.create({
        data: {
          organizationId,
          planId: plan.id,
          status: "ACTIVE",
          startsAt: invoice.periodStart,
          endsAt: invoice.periodEnd,
          graceEndsAt: invoice.graceEndsAt,
        },
      });
      if (version.moduleIds.length) {
        await tx.organizationModule.deleteMany({ where: { organizationId } });
        await tx.organizationModule.createMany({
          data: version.moduleIds.map((moduleId) => ({
            organizationId,
            moduleId,
          })),
        });
      }
      await this.audit.create(
        {
          organizationId,
          actorType: "PLATFORM_ADMIN",
          actorId: adminId,
          action: "billing.period_activated",
          entityType: "OrganizationSubscription",
          entityId: subscription.id,
          afterValue: { invoiceId, endsAt: invoice.periodEnd.toISOString() },
        },
        tx,
      );
      return subscription;
    });
  }
}
