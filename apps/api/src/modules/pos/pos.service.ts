import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../audit/audit.service";

type Actor = { organizationId: string; userId: string };
type Meta = { ipAddress?: string; userAgent?: string };

@Injectable()
export class PosService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  catalog(actor: Actor, branchId: string) {
    return this.prisma.withTenant(actor.organizationId, tx => tx.product.findMany({ where: { organizationId: actor.organizationId, isActive: true }, include: { category: true, variants: { where: { isActive: true } }, prices: { where: { branchId } } }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }] }));
  }

  async createProduct(actor: Actor, input: any, meta: Meta) {
    return this.prisma.withTenant(actor.organizationId, async tx => {
      const product = await tx.product.create({ data: { organizationId: actor.organizationId, categoryId: input.categoryId, name: input.name, sku: input.sku, barcode: input.barcode, taxRateBps: input.taxRateBps ?? 0, isCombo: input.isCombo ?? false, comboItems: input.comboItems ?? [], modifierConfig: input.modifierConfig ?? [], variants: { create: (input.variants ?? []).map((v: any) => ({ organizationId: actor.organizationId, name: v.name, priceMinor: v.priceMinor })) }, prices: { create: input.prices.map((p: any) => ({ organizationId: actor.organizationId, branchId: p.branchId, priceMinor: p.priceMinor })) } }, include: { variants: true, prices: true } });
      await this.audit.create({ organizationId: actor.organizationId, userId: actor.userId, actorType: "USER", actorId: actor.userId, action: "product.created", entityType: "Product", entityId: product.id, afterValue: { name: product.name }, ...meta }, tx);
      return product;
    });
  }

  async openRegister(actor: Actor, input: { branchId: string; openingFloatMinor: number }, meta: Meta) {
    return this.prisma.withTenant(actor.organizationId, async tx => {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: actor.organizationId, isActive: true } });
      if (!branch) throw new NotFoundException("Branch not found.");
      const active = await tx.registerSession.findFirst({ where: { organizationId: actor.organizationId, branchId: input.branchId, closedAt: null } });
      if (active) throw new ConflictException("This branch already has an open register.");
      return tx.registerSession.create({ data: { organizationId: actor.organizationId, branchId: input.branchId, openedById: actor.userId, openingFloatMinor: input.openingFloatMinor } });
    });
  }

  async createOrder(actor: Actor, input: any, meta: Meta) {
    if (!input.items?.length || !input.payments?.length) throw new BadRequestException("An order needs items and at least one payment.");
    return this.prisma.withTenant(actor.organizationId, async tx => {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: actor.organizationId, isActive: true } });
      if (!branch) throw new NotFoundException("Branch not found.");
      const register = input.registerId ? await tx.registerSession.findFirst({ where: { id: input.registerId, organizationId: actor.organizationId, branchId: input.branchId, closedAt: null } }) : null;
      if (input.registerId && !register) throw new BadRequestException("Register is not open for this branch.");
      const products = await tx.product.findMany({ where: { organizationId: actor.organizationId, id: { in: input.items.map((i: any) => i.productId) }, isActive: true }, include: { variants: true, prices: { where: { branchId: input.branchId } } } });
      if (products.length !== new Set(input.items.map((i: any) => i.productId)).size) throw new BadRequestException("One or more products are unavailable.");
      const lines = input.items.map((item: any) => {
        const product = products.find(p => p.id === item.productId)!;
        const variant = item.variantId ? product.variants.find(v => v.id === item.variantId && v.isActive) : null;
        if (item.variantId && !variant) throw new BadRequestException("Invalid product variant.");
        const price = variant?.priceMinor ?? product.prices[0]?.priceMinor;
        if (price == null) throw new BadRequestException(`No branch price configured for ${product.name}.`);
        const quantity = Number(item.quantity); if (!Number.isInteger(quantity) || quantity <= 0) throw new BadRequestException("Quantity must be a positive integer.");
        const line = price * quantity; const tax = Math.round(line * product.taxRateBps / 10000);
        return { organizationId: actor.organizationId, productId: product.id, variantId: variant?.id, nameSnapshot: variant ? `${product.name} — ${variant.name}` : product.name, quantity, unitPriceMinor: price, taxMinor: tax, lineTotalMinor: line, modifiers: item.modifiers ?? [] };
      });
      const subtotalMinor = lines.reduce((n: number, l: { lineTotalMinor: number }) => n + l.lineTotalMinor, 0); const taxMinor = lines.reduce((n: number, l: { taxMinor: number }) => n + l.taxMinor, 0); const totalMinor = subtotalMinor + taxMinor;
      const paid = input.payments.reduce((n: number, p: any) => n + Number(p.amountMinor), 0); if (paid !== totalMinor) throw new BadRequestException("Payment total must equal the order total.");
      const last = await tx.posOrder.findFirst({ where: { organizationId: actor.organizationId }, orderBy: { orderNumber: "desc" }, select: { orderNumber: true } });
      const order = await tx.posOrder.create({ data: { organizationId: actor.organizationId, branchId: input.branchId, registerId: input.registerId, createdById: actor.userId, orderNumber: (last?.orderNumber ?? 0) + 1, orderType: input.orderType ?? "TAKEAWAY", subtotalMinor, taxMinor, totalMinor, items: { create: lines }, payments: { create: input.payments.map((p: any) => ({ organizationId: actor.organizationId, method: p.method, amountMinor: p.amountMinor, reference: p.reference })) }, receipt: { create: { organizationId: actor.organizationId, receiptNumber: `R-${String((last?.orderNumber ?? 0) + 1).padStart(6, "0")}` } } }, include: { items: true, payments: true, receipt: true } });
      await this.audit.create({ organizationId: actor.organizationId, userId: actor.userId, actorType: "USER", actorId: actor.userId, action: "order.created", entityType: "PosOrder", entityId: order.id, afterValue: { totalMinor, orderNumber: order.orderNumber }, ...meta }, tx);
      return order;
    });
  }

  order(actor: Actor, id: string) { return this.prisma.withTenant(actor.organizationId, tx => tx.posOrder.findFirst({ where: { id, organizationId: actor.organizationId }, include: { items: true, payments: true, receipt: true } })); }
}
