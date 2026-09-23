import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { sha256 } from "../../common/security";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../audit/audit.service";

type Actor = {
  organizationId: string;
  userId: string;
  branchIds: string[];
  isOwner?: boolean;
  permissions?: string[];
};
type Meta = { ipAddress?: string; userAgent?: string };
const MAX_MINOR = 2_000_000_000;
const BUILTIN_TENDERS = new Set([
  "CASH",
  "MANUAL_CARD",
  "BANK_TRANSFER",
  "JAZZCASH",
  "EASYPAISA",
]);
function safeMinor(value: unknown, label: string) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) > MAX_MINOR
  )
    throw new BadRequestException(`${label} must be a safe integer amount.`);
  return Number(value);
}

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async branch(tx: any, actor: Actor, branchId: string) {
    if (!actor.isOwner && !actor.branchIds.includes(branchId))
      throw new ForbiddenException("You are not assigned to this branch.");
    const branch = await tx.branch.findFirst({
      where: {
        id: branchId,
        organizationId: actor.organizationId,
        isActive: true,
      },
    });
    if (!branch) throw new NotFoundException("Branch not found.");
    if (!actor.isOwner) {
      const assignments = await tx.userRole.findMany({
        where: { organizationId: actor.organizationId, userId: actor.userId },
        select: { role: { select: { scope: true } } },
      });
      const scoped = assignments
        .map((a: any) => a.role.scope?.branchIds)
        .filter((ids: unknown): ids is string[] => Array.isArray(ids));
      if (
        scoped.length &&
        !scoped.some((ids: string[]) => ids.includes(branchId))
      )
        throw new ForbiddenException(
          "Your role scope does not include this branch.",
        );
    }
    return branch;
  }

  private async lockOpenRegister(
    tx: any,
    actor: Actor,
    registerId: string,
    branchId: string,
  ) {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM register_sessions WHERE id = CAST(${registerId} AS uuid) AND organization_id = CAST(${actor.organizationId} AS uuid) AND branch_id = CAST(${branchId} AS uuid) FOR UPDATE`,
    );
    return tx.registerSession.findFirst({
      where: {
        id: registerId,
        organizationId: actor.organizationId,
        branchId,
        closedAt: null,
      },
    });
  }

  async catalog(
    actor: Actor,
    branchId: string,
    search?: string,
    categoryId?: string,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, branchId);
      return tx.product.findMany({
        where: {
          organizationId: actor.organizationId,
          isActive: true,
          ...(categoryId ? { categoryId } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { sku: { contains: search, mode: "insensitive" } },
                  { barcode: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          category: true,
          variants: { where: { isActive: true } },
          prices: { where: { branchId } },
        },
        orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      });
    });
  }
  async categories(actor: Actor) {
    return this.prisma.withTenant(actor.organizationId, (tx) =>
      tx.productCategory.findMany({
        where: { organizationId: actor.organizationId, isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
    );
  }
  async createCategory(
    actor: Actor,
    input: { name: string; sortOrder?: number },
    meta: Meta,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const category = await tx.productCategory.create({
        data: {
          organizationId: actor.organizationId,
          name: input.name,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "product.category_created",
          entityType: "ProductCategory",
          entityId: category.id,
          afterValue: { name: category.name },
          ...meta,
        },
        tx,
      );
      return category;
    });
  }
  async createProduct(actor: Actor, input: any, meta: Meta) {
    if (input.isCombo)
      throw new BadRequestException(
        "Combo pricing is not enabled until component pricing is configured.",
      );
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      if (
        input.categoryId &&
        !(await tx.productCategory.findFirst({
          where: {
            id: input.categoryId,
            organizationId: actor.organizationId,
            isActive: true,
          },
        }))
      )
        throw new BadRequestException(
          "Category does not belong to this business.",
        );
      const branchIds: string[] = Array.from(
        new Set<string>(input.prices.map((p: any) => String(p.branchId))),
      );
      for (const id of branchIds) await this.branch(tx, actor, id);
      const product = await tx.product.create({
        data: {
          organizationId: actor.organizationId,
          categoryId: input.categoryId,
          name: input.name,
          sku: input.sku,
          barcode: input.barcode,
          taxRateBps: input.taxRateBps ?? 0,
          isCombo: false,
          comboItems: [],
          modifierConfig: input.modifierConfig ?? [],
          variants: {
            create: (input.variants ?? []).map((v: any) => ({
              organizationId: actor.organizationId,
              name: v.name,
              priceMinor: safeMinor(v.priceMinor, "Variant price"),
            })),
          },
          prices: {
            create: input.prices.map((p: any) => ({
              organizationId: actor.organizationId,
              branchId: p.branchId,
              priceMinor: safeMinor(p.priceMinor, "Price"),
            })),
          },
        },
        include: { variants: true, prices: true },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "product.created",
          entityType: "Product",
          entityId: product.id,
          afterValue: { name: product.name },
          ...meta,
        },
        tx,
      );
      return product;
    });
  }
  async registers(actor: Actor, branchId: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, branchId);
      return tx.registerSession.findMany({
        where: { organizationId: actor.organizationId, branchId },
        orderBy: { openedAt: "desc" },
        take: 20,
      });
    });
  }
  async openRegister(
    actor: Actor,
    input: { branchId: string; openingFloatMinor: number },
    meta: Meta,
  ) {
    safeMinor(input.openingFloatMinor, "Opening float");
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, input.branchId);
      try {
        const register = await tx.registerSession.create({
          data: {
            organizationId: actor.organizationId,
            branchId: input.branchId,
            openedById: actor.userId,
            openingFloatMinor: input.openingFloatMinor,
          },
        });
        await this.audit.create(
          {
            organizationId: actor.organizationId,
            userId: actor.userId,
            actorType: "USER",
            actorId: actor.userId,
            action: "register.opened",
            entityType: "RegisterSession",
            entityId: register.id,
            ...meta,
          },
          tx,
        );
        return register;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new ConflictException(
            "This branch already has an open register.",
          );
        throw error;
      }
    });
  }

  async closeRegister(
    actor: Actor,
    id: string,
    closingTotalMinor: number,
    meta: Meta,
  ) {
    safeMinor(closingTotalMinor, "Closing total");
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const existing = await tx.registerSession.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!existing) throw new NotFoundException("Register not found.");
      await this.branch(tx, actor, existing.branchId);
      const register = await this.lockOpenRegister(
        tx,
        actor,
        id,
        existing.branchId,
      );
      if (!register) throw new NotFoundException("Open register not found.");
      const closed = await tx.registerSession.update({
        where: { id: register.id },
        data: { closedAt: new Date(), closingTotalMinor },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "register.closed",
          entityType: "RegisterSession",
          entityId: register.id,
          branchId: register.branchId,
          afterValue: { closingTotalMinor },
          ...meta,
        },
        tx,
      );
      return closed;
    });
  }

  private async quote(tx: any, actor: Actor, input: any) {
    await this.branch(tx, actor, input.branchId);
    const settings = await tx.businessSetting.findUnique({
      where: { organizationId: actor.organizationId },
      select: { taxConfig: true },
    });
    const config = (settings?.taxConfig ?? {}) as any;
    const configuredTaxMode = config.mode ?? "EXCLUSIVE";
    const taxMode = input.taxMode ?? configuredTaxMode;
    if (!["INCLUSIVE", "EXCLUSIVE"].includes(taxMode))
      throw new BadRequestException("Tax mode must be INCLUSIVE or EXCLUSIVE.");
    if (
      taxMode !== configuredTaxMode &&
      !actor.isOwner &&
      !actor.permissions?.includes("pos.tax.override")
    )
      throw new ForbiddenException(
        "Your role cannot override the configured tax mode.",
      );
    if (taxMode !== configuredTaxMode && !input.taxOverrideReason)
      throw new BadRequestException(
        "A reason is required for a tax mode override.",
      );
    const products = await tx.product.findMany({
      where: {
        organizationId: actor.organizationId,
        id: { in: input.items.map((i: any) => i.productId) },
        isActive: true,
      },
      include: {
        variants: { where: { isActive: true } },
        prices: { where: { branchId: input.branchId } },
      },
    });
    if (
      products.length !== new Set(input.items.map((i: any) => i.productId)).size
    )
      throw new BadRequestException(
        "One or more products are unavailable in this business.",
      );
    const lines: any[] = [];
    for (const item of input.items) {
      const product = products.find((p: any) => p.id === item.productId)!;
      const variant = item.variantId
        ? product.variants.find((v: any) => v.id === item.variantId)
        : null;
      if (item.variantId && !variant)
        throw new BadRequestException("Variant is unavailable.");
      const base = variant?.priceMinor ?? product.prices[0]?.priceMinor;
      if (base == null)
        throw new BadRequestException(
          `No branch price configured for ${product.name}.`,
        );
      const quantity = safeMinor(item.quantity, "Quantity");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000)
        throw new BadRequestException("Quantity must be a positive integer.");
      const configured = Array.isArray(product.modifierConfig)
        ? product.modifierConfig
        : [];
      const selected = item.modifiers ?? [];
      let modifierMinor = 0;
      const snapshots: any[] = [];
      for (const selectedModifier of selected) {
        const option = configured.find(
          (m: any) => m.id === selectedModifier.id && m.active !== false,
        );
        if (!option)
          throw new BadRequestException(
            `Modifier is unavailable for ${product.name}.`,
          );
        const amount = safeMinor(option.priceMinor ?? 0, "Modifier price");
        modifierMinor += amount;
        snapshots.push({
          id: option.id,
          name: option.name,
          priceMinor: amount,
        });
      }
      const grossOrNet = (base + modifierMinor) * quantity;
      const rate = product.taxRateBps;
      const tax =
        taxMode === "INCLUSIVE"
          ? Math.round(grossOrNet - (grossOrNet * 10000) / (10000 + rate))
          : Math.round((grossOrNet * rate) / 10000);
      const net = taxMode === "INCLUSIVE" ? grossOrNet - tax : grossOrNet;
      lines.push({
        organizationId: actor.organizationId,
        productId: product.id,
        variantId: variant?.id,
        nameSnapshot: variant
          ? `${product.name} — ${variant.name}`
          : product.name,
        quantity,
        unitPriceMinor: base + modifierMinor,
        taxMinor: tax,
        lineTotalMinor: net,
        modifiers: snapshots,
      });
    }
    const subtotalMinor = lines.reduce((n, l) => n + l.lineTotalMinor, 0);
    const taxMinor = lines.reduce((n, l) => n + l.taxMinor, 0);
    return {
      lines,
      subtotalMinor,
      taxMinor,
      totalMinor: subtotalMinor + taxMinor,
      taxMode,
    };
  }
  async preview(actor: Actor, input: any) {
    return this.prisma.withTenant(actor.organizationId, (tx) =>
      this.quote(tx, actor, input),
    );
  }
  private async idempotent(
    tx: any,
    actor: Actor,
    key: string,
    operation: string,
    hash: string,
  ) {
    const existing = await tx.idempotencyKey.findUnique({
      where: {
        organizationId_key_operation: {
          organizationId: actor.organizationId,
          key,
          operation,
        },
      },
    });
    if (existing) {
      if (existing.requestHash !== hash)
        throw new ConflictException(
          "This idempotency key was already used for a different request.",
        );
      if (existing.responseBody) return existing.responseBody;
      throw new ConflictException(
        "The original request is still being committed; retry with the same key.",
      );
    }
    try {
      await tx.idempotencyKey.create({
        data: {
          organizationId: actor.organizationId,
          key,
          operation,
          requestHash: hash,
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const race = await tx.idempotencyKey.findUniqueOrThrow({
          where: {
            organizationId_key_operation: {
              organizationId: actor.organizationId,
              key,
              operation,
            },
          },
        });
        if (race.requestHash !== hash)
          throw new ConflictException(
            "This idempotency key was already used for a different request.",
          );
        if (race.responseBody) return race.responseBody;
        throw new ConflictException(
          "Retry after the original request completes.",
        );
      }
      throw error;
    }
    return null;
  }
  async createOrder(
    actor: Actor,
    input: any,
    idempotencyKey: string,
    meta: Meta,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 160)
      throw new BadRequestException("An Idempotency-Key header is required.");
    const hash = sha256(JSON.stringify(input));
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idempotent(
        tx,
        actor,
        idempotencyKey,
        "pos.order.create",
        hash,
      );
      if (prior) return prior;
      const quote = await this.quote(tx, actor, input);
      const register = input.registerId
        ? await this.lockOpenRegister(
            tx,
            actor,
            input.registerId,
            input.branchId,
          )
        : null;
      if (!input.hold && !register)
        throw new BadRequestException(
          "Select an open register before checkout.",
        );
      const payments = input.payments ?? [];
      let paidMinor = 0;
      let hasCash = false;
      for (const payment of payments) {
        const amount = safeMinor(payment.amountMinor, "Tender amount");
        if (!Number.isInteger(amount) || amount <= 0)
          throw new BadRequestException("Tender amount must be positive.");
        if (payment.method === "CASH") hasCash = true;
        const allowed =
          BUILTIN_TENDERS.has(payment.method) ||
          (await tx.paymentMethod.findFirst({
            where: {
              organizationId: actor.organizationId,
              key: payment.method,
              isActive: true,
            },
          }));
        if (!allowed)
          throw new BadRequestException(
            `Payment method ${payment.method} is not active.`,
          );
        if (payment.verifiedExternal)
          throw new BadRequestException(
            "External payment confirmation must come from a verified provider callback; manual tenders cannot claim verification.",
          );
        paidMinor += amount;
      }
      if (!input.hold && paidMinor < quote.totalMinor)
        throw new BadRequestException("Tender total is below the order total.");
      if (!input.hold && paidMinor > quote.totalMinor && !hasCash)
        throw new BadRequestException("Only cash tender may include change.");
      const order = await tx.posOrder.create({
        data: {
          organizationId: actor.organizationId,
          branchId: input.branchId,
          registerId: input.registerId,
          createdById: actor.userId,
          orderType: input.orderType ?? "TAKEAWAY",
          status: input.hold ? "HELD" : "PAID",
          subtotalMinor: quote.subtotalMinor,
          taxMinor: quote.taxMinor,
          totalMinor: quote.totalMinor,
          taxMode: quote.taxMode,
          discountMinor: 0,
          paidMinor: input.hold ? 0 : paidMinor,
          changeMinor: input.hold
            ? 0
            : Math.max(0, paidMinor - quote.totalMinor),
          items: { create: quote.lines },
          payments: input.hold
            ? undefined
            : {
                create: payments.map((p: any) => ({
                  organizationId: actor.organizationId,
                  method: p.method,
                  amountMinor: p.amountMinor,
                  reference: p.reference,
                  tenderKind: "MANUAL",
                })),
              },
        },
      });
      let receipt: any = null;
      if (!input.hold)
        receipt = await tx.posReceipt.create({
          data: {
            organizationId: actor.organizationId,
            orderId: order.id,
            receiptNumber: `R-${String(order.orderNumber).padStart(6, "0")}`,
          },
        });
      const result = { ...order, receipt };
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: input.hold ? "order.held" : "order.created",
          entityType: "PosOrder",
          entityId: order.id,
          branchId: input.branchId,
          afterValue: {
            totalMinor: quote.totalMinor,
            orderNumber: order.orderNumber,
            ...(input.taxOverrideReason
              ? { taxOverrideReason: input.taxOverrideReason }
              : {}),
          },
          ...meta,
        },
        tx,
      );
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key: idempotencyKey,
            operation: "pos.order.create",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }

  async resumeOrder(
    actor: Actor,
    id: string,
    input: any,
    key: string,
    meta: Meta,
  ) {
    if (!key)
      throw new BadRequestException("An Idempotency-Key header is required.");
    const hash = sha256(JSON.stringify({ id, input }));
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idempotent(
        tx,
        actor,
        key,
        "pos.order.resume",
        hash,
      );
      if (prior) return prior;
      const held = await tx.posOrder.findFirst({
        where: { id, organizationId: actor.organizationId, status: "HELD" },
        include: { items: true },
      });
      if (!held) throw new NotFoundException("Held order not found.");
      await this.branch(tx, actor, held.branchId);
      const register = await this.lockOpenRegister(
        tx,
        actor,
        input.registerId,
        held.branchId,
      );
      if (!register)
        throw new BadRequestException(
          "Select an open register before resuming.",
        );
      let paid = 0;
      let hasCash = false;
      const payments = input.payments ?? [];
      for (const p of payments) {
        const amount = safeMinor(p.amountMinor, "Tender amount");
        if (amount <= 0)
          throw new BadRequestException("Tender amount must be positive.");
        if (
          !BUILTIN_TENDERS.has(p.method) &&
          !(await tx.paymentMethod.findFirst({
            where: {
              organizationId: actor.organizationId,
              key: p.method,
              isActive: true,
            },
          }))
        )
          throw new BadRequestException(
            `Payment method ${p.method} is not active.`,
          );
        if (p.method === "CASH") hasCash = true;
        if (p.verifiedExternal)
          throw new BadRequestException(
            "Manual tenders cannot claim external verification.",
          );
        paid += amount;
      }
      if (paid < held.totalMinor)
        throw new BadRequestException("Tender total is below the order total.");
      if (paid > held.totalMinor && !hasCash)
        throw new BadRequestException("Only cash tender may include change.");
      const updated = await tx.posOrder.update({
        where: { id: held.id },
        data: {
          registerId: register.id,
          status: "PAID",
          paidMinor: paid,
          changeMinor: Math.max(0, paid - held.totalMinor),
          payments: {
            create: payments.map((p: any) => ({
              organizationId: actor.organizationId,
              method: p.method,
              amountMinor: p.amountMinor,
              reference: p.reference,
              tenderKind: "MANUAL",
            })),
          },
        },
      });
      const receipt = await tx.posReceipt.create({
        data: {
          organizationId: actor.organizationId,
          orderId: held.id,
          receiptNumber: `R-${String(held.orderNumber).padStart(6, "0")}`,
        },
      });
      const result = { ...updated, receipt };
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "order.resumed",
          entityType: "PosOrder",
          entityId: held.id,
          branchId: held.branchId,
          ...meta,
        },
        tx,
      );
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "pos.order.resume",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }

  async voidOrder(
    actor: Actor,
    id: string,
    reason: string,
    key: string,
    meta: Meta,
  ) {
    if (!key)
      throw new BadRequestException("An Idempotency-Key header is required.");
    const hash = sha256(JSON.stringify({ id, reason }));
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idempotent(
        tx,
        actor,
        key,
        "pos.order.void",
        hash,
      );
      if (prior) return prior;
      const order = await tx.posOrder.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!order) throw new NotFoundException("Order not found.");
      await this.branch(tx, actor, order.branchId);
      if (order.paidMinor > 0)
        throw new BadRequestException(
          "Paid sales must use the refund workflow.",
        );
      const updated = await tx.posOrder.update({
        where: { id },
        data: { status: "VOIDED" },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "order.voided",
          entityType: "PosOrder",
          entityId: id,
          branchId: order.branchId,
          reason,
          ...meta,
        },
        tx,
      );
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "pos.order.void",
          },
        },
        data: { responseCode: 201, responseBody: updated as any },
      });
      return updated;
    });
  }
  async order(actor: Actor, id: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const order = await tx.posOrder.findFirst({
        where: { id, organizationId: actor.organizationId },
        include: { items: true, payments: true, receipt: true, refunds: true },
      });
      if (!order) throw new NotFoundException("Order not found.");
      await this.branch(tx, actor, order.branchId);
      return order;
    });
  }
  async history(actor: Actor, branchId: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, branchId);
      return tx.posOrder.findMany({
        where: { organizationId: actor.organizationId, branchId },
        include: { receipt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    });
  }
  async refund(
    actor: Actor,
    id: string,
    input: { amountMinor: number; reason: string; disposition?: string },
    key: string,
    meta: Meta,
  ) {
    if (!key || key.length < 8 || key.length > 160)
      throw new BadRequestException(
        "A valid Idempotency-Key header is required.",
      );
    const hash = sha256(JSON.stringify({ orderId: id, ...input }));
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idempotent(
        tx,
        actor,
        key,
        "pos.order.refund",
        hash,
      );
      if (prior) return prior;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM pos_orders WHERE id = CAST(${id} AS uuid) AND organization_id = CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const order = await tx.posOrder.findFirst({
        where: { id, organizationId: actor.organizationId },
        include: { refunds: true },
      });
      if (!order) throw new NotFoundException("Order not found.");
      await this.branch(tx, actor, order.branchId);
      const amount = safeMinor(input.amountMinor, "Refund amount");
      const refunded = order.refunds.reduce((n, r) => n + r.amountMinor, 0);
      const refundableBalance = order.totalMinor - refunded;
      if (amount <= 0 || amount > refundableBalance)
        throw new BadRequestException(
          `Refund exceeds the refundable balance of ${Math.max(0, refundableBalance)} minor units.`,
        );
      const refund = await tx.posRefund.create({
        data: {
          organizationId: actor.organizationId,
          orderId: order.id,
          amountMinor: amount,
          reason: input.reason,
          disposition: input.disposition ?? "NO_STOCK",
          createdById: actor.userId,
        },
      });
      const updated = await tx.posOrder.update({
        where: { id: order.id },
        data: {
          refundedMinor: refunded + amount,
          status:
            refunded + amount === order.totalMinor
              ? "REFUNDED"
              : "PARTIALLY_REFUNDED",
        },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "order.refunded",
          entityType: "PosOrder",
          entityId: order.id,
          branchId: order.branchId,
          reason: input.reason,
          afterValue: { amountMinor: amount, disposition: refund.disposition },
          ...meta,
        },
        tx,
      );
      const result = { refund, order: updated };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "pos.order.refund",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }
  async receipt(actor: Actor, id: string) {
    const order: any = await this.order(actor, id);
    if (!order.receipt)
      throw new NotFoundException("This held order has no receipt yet.");
    return order;
  }
}
