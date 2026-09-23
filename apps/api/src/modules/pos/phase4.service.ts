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
import { PosService } from "./pos.service";

type Actor = {
  organizationId: string;
  userId: string;
  branchIds: string[];
  isOwner?: boolean;
  permissions?: string[];
};
const MAX_MINOR = 2_000_000_000;
const safeAmount = (value: unknown) => {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) > MAX_MINOR
  )
    throw new BadRequestException("Amount must be a safe integer.");
  return Number(value);
};

@Injectable()
export class Phase4Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pos: PosService,
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
  private orderAccess(actor: Actor, order: any, mode: "view" | "edit") {
    if (actor.isOwner || order.createdById === actor.userId) return;
    const allowed =
      mode === "view"
        ? ["orders.dinein.settle", "orders.dinein.transfer"]
        : ["orders.dinein.transfer"];
    if (!allowed.some((permission) => actor.permissions?.includes(permission)))
      throw new ForbiddenException("This order is assigned to another waiter.");
  }
  async tables(actor: Actor, branchId: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, branchId);
      return tx.floorTable.findMany({
        where: {
          organizationId: actor.organizationId,
          branchId,
          isActive: true,
        },
        orderBy: { name: "asc" },
      });
    });
  }
  async createTable(actor: Actor, input: any) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, input.branchId);
      return tx.floorTable.create({
        data: {
          organizationId: actor.organizationId,
          branchId: input.branchId,
          name: input.name,
          capacity: input.capacity ?? 2,
        },
      });
    });
  }
  async stations(actor: Actor, branchId: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, branchId);
      return tx.kitchenStation.findMany({
        where: {
          organizationId: actor.organizationId,
          branchId,
          isActive: true,
        },
        orderBy: { name: "asc" },
      });
    });
  }
  async createStation(actor: Actor, input: any) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, input.branchId);
      return tx.kitchenStation.create({
        data: {
          organizationId: actor.organizationId,
          branchId: input.branchId,
          name: input.name,
        },
      });
    });
  }
  private async idem(
    tx: any,
    actor: Actor,
    key: string,
    operation: string,
    payload: any,
  ) {
    if (!key || key.length < 8 || key.length > 160)
      throw new BadRequestException("A valid Idempotency-Key is required.");
    const hash = sha256(JSON.stringify(payload));
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
        throw new ConflictException("Idempotency key conflict.");
      if (existing.responseBody) return existing.responseBody;
      throw new ConflictException(
        "Retry after the original request completes.",
      );
    }
    await tx.idempotencyKey.create({
      data: {
        organizationId: actor.organizationId,
        key,
        operation,
        requestHash: hash,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    return null;
  }
  async openOrder(actor: Actor, input: any, key: string, meta: any) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idem(
        tx,
        actor,
        key,
        "phase4.dinein.open",
        input,
      );
      if (prior) return prior;
      await this.branch(tx, actor, input.branchId);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM floor_tables WHERE id = CAST(${input.tableId} AS uuid) AND organization_id = CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const table = await tx.floorTable.findFirst({
        where: {
          id: input.tableId,
          organizationId: actor.organizationId,
          branchId: input.branchId,
          isActive: true,
        },
      });
      if (!table) throw new NotFoundException("Table not found.");
      if (table.status === "OCCUPIED")
        throw new ConflictException("Table is already occupied.");
      const station = await tx.kitchenStation.findFirst({
        where: {
          id: input.stationId,
          organizationId: actor.organizationId,
          branchId: input.branchId,
          isActive: true,
        },
      });
      if (!station) throw new NotFoundException("Kitchen station not found.");
      const quote = await this.pos.quote(tx, actor, {
        branchId: input.branchId,
        items: input.items,
      });
      const order = await tx.posOrder.create({
        data: {
          organizationId: actor.organizationId,
          branchId: input.branchId,
          tableId: table.id,
          createdById: actor.userId,
          orderType: "DINE_IN",
          status: "UNPAID",
          serviceStatus: "SUBMITTED",
          subtotalMinor: quote.subtotalMinor,
          taxMinor: quote.taxMinor,
          totalMinor: quote.totalMinor,
          taxMode: quote.taxMode,
          items: { create: quote.lines },
        },
      });
      const ticket = await tx.kitchenTicket.create({
        data: {
          organizationId: actor.organizationId,
          branchId: input.branchId,
          orderId: order.id,
          stationId: station.id,
          sequence: 1,
          kind: "INITIAL",
          items: quote.lines,
          createdById: actor.userId,
        },
      });
      await tx.kitchenOutbox.create({
        data: {
          organizationId: actor.organizationId,
          branchId: input.branchId,
          ticketId: ticket.id,
          eventType: "KITCHEN_TICKET_CREATED",
          payload: { ticketId: ticket.id, orderId: order.id },
        },
      });
      await tx.floorTable.update({
        where: { id: table.id },
        data: { status: "OCCUPIED" },
      });
      const result = { order, ticket };
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "dinein.order.opened",
          entityType: "PosOrder",
          entityId: order.id,
          branchId: input.branchId,
          afterValue: { ticketId: ticket.id },
          ...meta,
        },
        tx,
      );
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "phase4.dinein.open",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }
  async addItems(
    actor: Actor,
    orderId: string,
    input: any,
    key: string,
    meta: any,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idem(tx, actor, key, "phase4.dinein.add", {
        orderId,
        ...input,
      });
      if (prior) return prior;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM pos_orders WHERE id = CAST(${orderId} AS uuid) AND organization_id = CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const order = await tx.posOrder.findFirst({
        where: { id: orderId, organizationId: actor.organizationId },
        include: { tickets: true },
      });
      if (!order) throw new NotFoundException("Dine-in order not found.");
      await this.branch(tx, actor, order.branchId);
      this.orderAccess(actor, order, "edit");
      if (
        order.orderType !== "DINE_IN" ||
        !["UNPAID", "OPEN"].includes(order.status) ||
        ["CLOSED", "VOID", "PAID", "CANCELLED"].includes(order.serviceStatus)
      )
        throw new ConflictException(
          "This order can no longer accept additions.",
        );
      if (order.version !== input.expectedVersion)
        throw new ConflictException(
          "Order changed; refresh before adding items.",
        );
      const station = await tx.kitchenStation.findFirst({
        where: {
          id: input.stationId,
          organizationId: actor.organizationId,
          branchId: order.branchId,
          isActive: true,
        },
      });
      if (!station) throw new NotFoundException("Kitchen station not found.");
      const quote = await this.pos.quote(tx, actor, {
        branchId: order.branchId,
        items: input.items,
      });
      const sequence =
        order.tickets.reduce(
          (max: number, t: any) => Math.max(max, t.sequence),
          0,
        ) + 1;
      await tx.posOrderItem.createMany({
        data: quote.lines.map((line: any) => ({ ...line, orderId: order.id })),
      });
      const updated = await tx.posOrder.update({
        where: { id: order.id },
        data: {
          subtotalMinor: { increment: quote.subtotalMinor },
          taxMinor: { increment: quote.taxMinor },
          totalMinor: { increment: quote.totalMinor },
          version: { increment: 1 },
        },
      });
      const ticket = await tx.kitchenTicket.create({
        data: {
          organizationId: actor.organizationId,
          branchId: order.branchId,
          orderId: order.id,
          stationId: station.id,
          sequence,
          kind: "DELTA",
          items: quote.lines,
          createdById: actor.userId,
        },
      });
      await tx.kitchenOutbox.create({
        data: {
          organizationId: actor.organizationId,
          branchId: order.branchId,
          ticketId: ticket.id,
          eventType: "KITCHEN_TICKET_DELTA",
          payload: { ticketId: ticket.id, orderId: order.id, sequence },
        },
      });
      const result = { order: updated, ticket };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "phase4.dinein.add",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }
  async tickets(actor: Actor, branchId: string, stationId: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, branchId);
      const station = await tx.kitchenStation.findFirst({
        where: {
          id: stationId,
          organizationId: actor.organizationId,
          branchId,
          isActive: true,
        },
      });
      if (!station) throw new NotFoundException("Kitchen station not found.");
      return tx.kitchenTicket.findMany({
        where: {
          organizationId: actor.organizationId,
          branchId,
          stationId,
          status: { not: "READY" },
        },
        orderBy: { createdAt: "asc" },
      });
    });
  }
  async ready(
    actor: Actor,
    ticketId: string,
    expectedVersion: number,
    key: string,
    meta: any,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idem(tx, actor, key, "phase4.ticket.ready", {
        ticketId,
        expectedVersion,
      });
      if (prior) return prior;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM kitchen_tickets WHERE id = CAST(${ticketId} AS uuid) AND organization_id = CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const ticket = await tx.kitchenTicket.findFirst({
        where: { id: ticketId, organizationId: actor.organizationId },
      });
      if (!ticket) throw new NotFoundException("Ticket not found.");
      await this.branch(tx, actor, ticket.branchId);
      const station = await tx.kitchenStation.findFirst({
        where: {
          id: ticket.stationId,
          organizationId: actor.organizationId,
          branchId: ticket.branchId,
          isActive: true,
        },
      });
      if (!station) throw new ForbiddenException("Station is unavailable.");
      if (ticket.version !== expectedVersion || ticket.status === "READY")
        throw new ConflictException("Ticket changed; refresh before updating.");
      const updated = await tx.kitchenTicket.update({
        where: { id: ticket.id },
        data: {
          status: "READY",
          version: { increment: 1 },
          readyAt: new Date(),
        },
      });
      await tx.kitchenOutbox.create({
        data: {
          organizationId: actor.organizationId,
          branchId: ticket.branchId,
          ticketId: ticket.id,
          eventType: "KITCHEN_TICKET_READY",
          payload: { ticketId: ticket.id },
        },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "kitchen.ticket.ready",
          entityType: "KitchenTicket",
          entityId: ticket.id,
          branchId: ticket.branchId,
          ...meta,
        },
        tx,
      );
      const result = { ticket: updated };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "phase4.ticket.ready",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }
  async catchup(actor: Actor, branchId: string, after?: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, branchId);
      if (
        !actor.isOwner &&
        !actor.permissions?.includes("kitchen.tickets.view")
      )
        throw new ForbiddenException("Kitchen access is required.");
      return tx.kitchenOutbox.findMany({
        where: {
          organizationId: actor.organizationId,
          branchId,
          ...(after ? { createdAt: { gt: new Date(after) } } : {}),
        },
        include: { ticket: { select: { stationId: true } } },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
    });
  }
  async getOrder(actor: Actor, orderId: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const order = await tx.posOrder.findFirst({
        where: { id: orderId, organizationId: actor.organizationId },
        include: { items: true, tickets: true, table: true },
      });
      if (!order) throw new NotFoundException("Dine-in order not found.");
      await this.branch(tx, actor, order.branchId);
      this.orderAccess(actor, order, "view");
      return order;
    });
  }
  async transfer(
    actor: Actor,
    orderId: string,
    input: any,
    key: string,
    meta: any,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idem(tx, actor, key, "phase4.dinein.transfer", {
        orderId,
        ...input,
      });
      if (prior) return prior;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM pos_orders WHERE id=CAST(${orderId} AS uuid) AND organization_id=CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const order = await tx.posOrder.findFirst({
        where: { id: orderId, organizationId: actor.organizationId },
      });
      if (!order) throw new NotFoundException("Dine-in order not found.");
      await this.branch(tx, actor, order.branchId);
      this.orderAccess(actor, order, "edit");
      if (
        order.orderType !== "DINE_IN" ||
        order.status === "PAID" ||
        order.serviceStatus === "CLOSED"
      )
        throw new ConflictException(
          "Only an open dine-in order can be transferred.",
        );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM floor_tables WHERE id=CAST(${input.tableId} AS uuid) AND organization_id=CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const target = await tx.floorTable.findFirst({
        where: {
          id: input.tableId,
          organizationId: actor.organizationId,
          branchId: order.branchId,
          isActive: true,
        },
      });
      if (!target) throw new NotFoundException("Target table not found.");
      if (target.status !== "AVAILABLE")
        throw new ConflictException("Target table is not available.");
      if (input.waiterId) {
        const waiter = await tx.user.findFirst({
          where: {
            id: input.waiterId,
            organizationId: actor.organizationId,
            status: "ACTIVE",
            branchMemberships: { some: { branchId: order.branchId } },
          },
        });
        if (!waiter)
          throw new BadRequestException(
            "Target waiter is not assigned to this branch.",
          );
      }
      const updated = await tx.posOrder.update({
        where: { id: order.id },
        data: {
          tableId: target.id,
          createdById: input.waiterId ?? order.createdById,
          version: { increment: 1 },
        },
      });
      await tx.floorTable.update({
        where: { id: target.id },
        data: { status: "OCCUPIED" },
      });
      if (order.tableId)
        await tx.floorTable.update({
          where: { id: order.tableId },
          data: { status: "AVAILABLE" },
        });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "dinein.order.transferred",
          entityType: "PosOrder",
          entityId: order.id,
          branchId: order.branchId,
          beforeValue: { tableId: order.tableId, waiterId: order.createdById },
          afterValue: { tableId: target.id, waiterId: updated.createdById },
          ...meta,
        },
        tx,
      );
      const result = { order: updated };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "phase4.dinein.transfer",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }
  async waiterOrders(actor: Actor, branchId: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, branchId);
      return tx.posOrder.findMany({
        where: {
          organizationId: actor.organizationId,
          branchId,
          createdById: actor.userId,
          orderType: "DINE_IN",
          status: { in: ["UNPAID", "OPEN"] },
          serviceStatus: { notIn: ["CLOSED", "VOID", "CANCELLED"] },
        },
        include: { table: true, tickets: true, items: true },
        orderBy: { createdAt: "desc" },
      });
    });
  }
  async openOrders(actor: Actor, branchId: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, branchId);
      return tx.posOrder.findMany({
        where: {
          organizationId: actor.organizationId,
          branchId,
          orderType: "DINE_IN",
          status: { not: "PAID" },
          serviceStatus: { not: "CLOSED" },
        },
        include: { table: true, tickets: true, items: true },
        orderBy: { createdAt: "asc" },
      });
    });
  }
  async settle(
    actor: Actor,
    orderId: string,
    input: any,
    key: string,
    meta: any,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idem(tx, actor, key, "phase4.dinein.settle", {
        orderId,
        ...input,
      });
      if (prior) return prior;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM pos_orders WHERE id = CAST(${orderId} AS uuid) AND organization_id = CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const order = await tx.posOrder.findFirst({
        where: { id: orderId, organizationId: actor.organizationId },
        include: { table: true },
      });
      if (!order) throw new NotFoundException("Dine-in order not found.");
      await this.branch(tx, actor, order.branchId);
      if (
        order.orderType !== "DINE_IN" ||
        !["UNPAID", "OPEN"].includes(order.status) ||
        ["CLOSED", "VOID", "PAID", "CANCELLED"].includes(order.serviceStatus)
      )
        throw new ConflictException(
          "Only an eligible open dine-in order can be settled.",
        );
      const register = await this.pos.lockOpenRegister(
        tx,
        actor,
        input.registerId,
        order.branchId,
      );
      if (!register)
        throw new BadRequestException(
          "An open register for this branch is required.",
        );
      const payments = input.payments ?? [];
      if (!payments.length)
        throw new BadRequestException("At least one payment is required.");
      const tender = await this.pos.validateTender(
        tx,
        actor,
        payments,
        order.totalMinor,
      );
      const updated = await tx.posOrder.update({
        where: { id: order.id },
        data: {
          registerId: register.id,
          status: "PAID",
          serviceStatus: "CLOSED",
          paidMinor: tender.paidMinor,
          changeMinor: tender.changeMinor,
          version: { increment: 1 },
          payments: {
            create: payments.map((p: any) => ({
              organizationId: actor.organizationId,
              method: p.method,
              amountMinor: safeAmount(p.amountMinor),
              reference: p.reference,
              tenderKind: "MANUAL",
            })),
          },
        },
      });
      const receipt = await tx.posReceipt.create({
        data: {
          organizationId: actor.organizationId,
          orderId: order.id,
          receiptNumber: `R-${String(order.orderNumber).padStart(6, "0")}`,
        },
      });
      if (order.tableId)
        await tx.floorTable.update({
          where: { id: order.tableId },
          data: { status: "AVAILABLE" },
        });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "dinein.order.settled",
          entityType: "PosOrder",
          entityId: order.id,
          branchId: order.branchId,
          ...meta,
        },
        tx,
      );
      const result = { order: updated, receipt };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "phase4.dinein.settle",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }
}
