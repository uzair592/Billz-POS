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
  async bookings(actor: Actor, branchId: string) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      await this.branch(tx, actor, branchId);
      return tx.serviceBooking.findMany({
        where: { organizationId: actor.organizationId, branchId },
        include: {
          table: true,
          depositTransactions: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { startsAt: "asc" },
      });
    });
  }
  async createBooking(actor: Actor, input: any, key: string, meta: any) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idem(
        tx,
        actor,
        key,
        "phase4.booking.create",
        input,
      );
      if (prior) return prior;
      await this.branch(tx, actor, input.branchId);
      if (input.tableId) {
        const table = await tx.floorTable.findFirst({
          where: {
            id: input.tableId,
            organizationId: actor.organizationId,
            branchId: input.branchId,
            isActive: true,
          },
        });
        if (!table) throw new NotFoundException("Table not found.");
      }
      if (input.kind === "DELIVERY" && !input.deliveryAddress)
        throw new BadRequestException(
          "A delivery booking requires a delivery address.",
        );
      try {
        const booking = await tx.serviceBooking.create({
          data: {
            organizationId: actor.organizationId,
            branchId: input.branchId,
            tableId: input.tableId,
            kind: input.kind,
            status:
              input.status ??
              (input.kind === "WAITLIST" ? "WAITLISTED" : "CONFIRMED"),
            customerName: input.customerName,
            contact: input.contact,
            partySize: input.partySize,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            notes: input.notes,
            details: input.details ?? {},
            deliveryAddress: input.deliveryAddress,
            deliveryPhone: input.deliveryPhone,
            deliveryFeeMinor: safeAmount(input.deliveryFeeMinor ?? 0),
            courierName: input.courierName,
            depositMinor: safeAmount(input.depositMinor ?? 0),
          },
        });
        await this.audit.create(
          {
            organizationId: actor.organizationId,
            userId: actor.userId,
            actorType: "USER",
            actorId: actor.userId,
            action: "service.booking.created",
            entityType: "ServiceBooking",
            entityId: booking.id,
            branchId: input.branchId,
            ...meta,
          },
          tx,
        );
        await tx.idempotencyKey.update({
          where: {
            organizationId_key_operation: {
              organizationId: actor.organizationId,
              key,
              operation: "phase4.booking.create",
            },
          },
          data: { responseCode: 201, responseBody: booking as any },
        });
        return booking;
      } catch (error: any) {
        if (
          error?.code === "P2004" ||
          error?.code === "23P01" ||
          String(error?.message).includes("service_bookings_no_overlap")
        )
          throw new ConflictException(
            "This table already has an overlapping reservation.",
          );
        throw error;
      }
    });
  }
  async recordDeposit(
    actor: Actor,
    bookingId: string,
    input: any,
    key: string,
    meta: any,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const operation = `phase4.booking.deposit.${input.kind.toLowerCase()}`;
      const prior = await this.idem(tx, actor, key, operation, {
        bookingId,
        ...input,
      });
      if (prior) return prior;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM service_bookings WHERE id=CAST(${bookingId} AS uuid) AND organization_id=CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const booking = await tx.serviceBooking.findFirst({
        where: { id: bookingId, organizationId: actor.organizationId },
      });
      if (!booking) throw new NotFoundException("Booking not found.");
      await this.branch(tx, actor, booking.branchId);
      const knownStatuses = [
        "CONFIRMED",
        "WAITLISTED",
        "SEATED",
        "CANCELLED",
        "COMPLETED",
        "NO_SHOW",
      ];
      if (!knownStatuses.includes(booking.status))
        throw new ConflictException(
          "Booking status is not eligible for deposit activity.",
        );
      if (
        input.kind === "COLLECTION" &&
        !["CONFIRMED", "WAITLISTED"].includes(booking.status)
      )
        throw new ConflictException(
          "Deposits may only be collected for an active booking.",
        );
      const payment = await this.pos.validateManualPayment(tx, actor, input);
      const refundableMinor =
        booking.collectedDepositMinor -
        booking.refundedDepositMinor -
        booking.appliedDepositMinor;
      if (input.kind === "REFUND" && payment.amountMinor > refundableMinor)
        throw new BadRequestException(
          "Refund exceeds the unapplied collected deposit balance.",
        );
      await tx.bookingDepositTransaction.create({
        data: {
          organizationId: actor.organizationId,
          bookingId,
          kind: input.kind,
          method: payment.method,
          amountMinor: payment.amountMinor,
          reference: input.reference,
          createdById: actor.userId,
        },
      });
      const updated = await tx.serviceBooking.update({
        where: { id: bookingId },
        data:
          input.kind === "COLLECTION"
            ? {
                collectedDepositMinor: { increment: payment.amountMinor },
                version: { increment: 1 },
              }
            : {
                refundedDepositMinor: { increment: payment.amountMinor },
                version: { increment: 1 },
              },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: `service.deposit.${input.kind.toLowerCase()}`,
          entityType: "ServiceBooking",
          entityId: bookingId,
          branchId: booking.branchId,
          afterValue: {
            amountMinor: payment.amountMinor,
            method: payment.method,
            reference: input.reference,
          },
          ...meta,
        },
        tx,
      );
      const result = { booking: updated };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation,
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }
  async applyDeposit(
    actor: Actor,
    bookingId: string,
    orderId: string,
    key: string,
    meta: any,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idem(
        tx,
        actor,
        key,
        "phase4.booking.deposit.apply",
        { bookingId, orderId },
      );
      if (prior) return prior;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM service_bookings WHERE id=CAST(${bookingId} AS uuid) AND organization_id=CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const booking = await tx.serviceBooking.findFirst({
        where: { id: bookingId, organizationId: actor.organizationId },
      });
      if (!booking) throw new NotFoundException("Booking not found.");
      await this.branch(tx, actor, booking.branchId);
      if (booking.appliedOrderId)
        throw new ConflictException("Deposit has already been applied.");
      const availableDeposit =
        booking.collectedDepositMinor - booking.refundedDepositMinor;
      if (availableDeposit <= 0)
        throw new BadRequestException(
          "Booking has no collected deposit to apply.",
        );
      if (!["CONFIRMED", "SEATED"].includes(booking.status))
        throw new ConflictException(
          "Booking status is not eligible for deposit application.",
        );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM pos_orders WHERE id=CAST(${orderId} AS uuid) AND organization_id=CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const order = await tx.posOrder.findFirst({
        where: {
          id: orderId,
          organizationId: actor.organizationId,
          branchId: booking.branchId,
          orderType: "DINE_IN",
          status: { in: ["UNPAID", "OPEN"] },
          ...(booking.tableId ? { tableId: booking.tableId } : {}),
        },
        include: { payments: true },
      });
      if (!order)
        throw new ConflictException(
          "Deposit can only be applied to an eligible dine-in order.",
        );
      const alreadyPaidMinor = order.payments.reduce(
        (sum: number, payment: any) => sum + payment.amountMinor,
        0,
      );
      const outstandingMinor = Math.max(0, order.totalMinor - alreadyPaidMinor);
      if (outstandingMinor === 0)
        throw new ConflictException("Order has no remaining balance.");
      const amount = Math.min(availableDeposit, outstandingMinor);
      await tx.posOrderPayment.create({
        data: {
          organizationId: actor.organizationId,
          orderId,
          method: "DEPOSIT",
          amountMinor: amount,
          reference: booking.id,
          tenderKind: "DEPOSIT",
        },
      });
      await tx.posOrder.update({
        where: { id: orderId },
        data: { paidMinor: { increment: amount }, version: { increment: 1 } },
      });
      const updated = await tx.serviceBooking.update({
        where: { id: booking.id },
        data: {
          appliedOrderId: orderId,
          appliedDepositMinor: amount,
          status: "SEATED",
          version: { increment: 1 },
        },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "service.deposit.applied",
          entityType: "ServiceBooking",
          entityId: booking.id,
          branchId: booking.branchId,
          afterValue: { orderId, amountMinor: amount },
          ...meta,
        },
        tx,
      );
      const result = { booking: updated, appliedMinor: amount };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "phase4.booking.deposit.apply",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }
  async transitionBooking(
    actor: Actor,
    bookingId: string,
    input: any,
    key: string,
    meta: any,
  ) {
    const allowed: Record<string, string[]> = {
      CONFIRMED: ["SEATED", "CANCELLED", "NO_SHOW"],
      WAITLISTED: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
      SEATED: ["COMPLETED", "CANCELLED"],
      CANCELLED: [],
      COMPLETED: [],
      NO_SHOW: [],
    };
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const operation = `phase4.booking.transition.${input.status.toLowerCase()}`;
      const prior = await this.idem(tx, actor, key, operation, {
        bookingId,
        ...input,
      });
      if (prior) return prior;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM service_bookings WHERE id=CAST(${bookingId} AS uuid) AND organization_id=CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const booking = await tx.serviceBooking.findFirst({
        where: { id: bookingId, organizationId: actor.organizationId },
      });
      if (!booking) throw new NotFoundException("Booking not found.");
      await this.branch(tx, actor, booking.branchId);
      if (!(allowed[booking.status] ?? []).includes(input.status))
        throw new ConflictException(
          `A ${booking.status} booking cannot become ${input.status}.`,
        );
      const closing = ["CANCELLED", "NO_SHOW", "COMPLETED"].includes(
        input.status,
      );
      if (closing) {
        const refundableMinor =
          booking.collectedDepositMinor -
          booking.refundedDepositMinor -
          booking.appliedDepositMinor;
        if (refundableMinor > 0)
          throw new ConflictException(
            "Refund the unapplied collected deposit before closing this booking.",
          );
        if (booking.appliedOrderId) {
          const order = await tx.posOrder.findFirst({
            where: {
              id: booking.appliedOrderId,
              organizationId: actor.organizationId,
            },
          });
          if (order && ["UNPAID", "OPEN"].includes(order.status))
            throw new ConflictException(
              "Settle the linked order before closing this booking.",
            );
        }
      }
      const updated = await tx.serviceBooking.update({
        where: { id: bookingId },
        data: {
          status: input.status,
          ...(input.status === "CANCELLED" || input.status === "NO_SHOW"
            ? { cancellationReason: input.reason ?? null }
            : {}),
          version: { increment: 1 },
        },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: `service.booking.${input.status.toLowerCase()}`,
          entityType: "ServiceBooking",
          entityId: bookingId,
          branchId: booking.branchId,
          beforeValue: { status: booking.status },
          afterValue: { status: input.status, reason: input.reason ?? null },
          ...meta,
        },
        tx,
      );
      const result = { booking: updated };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation,
          },
        },
        data: { responseCode: 200, responseBody: result as any },
      });
      return result;
    });
  }
  async deliveryDispatch(
    actor: Actor,
    bookingId: string,
    input: any,
    key: string,
    meta: any,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const operation = `phase4.booking.delivery.${input.action.toLowerCase()}`;
      const prior = await this.idem(tx, actor, key, operation, {
        bookingId,
        ...input,
      });
      if (prior) return prior;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM service_bookings WHERE id=CAST(${bookingId} AS uuid) AND organization_id=CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const booking = await tx.serviceBooking.findFirst({
        where: { id: bookingId, organizationId: actor.organizationId },
      });
      if (!booking) throw new NotFoundException("Booking not found.");
      await this.branch(tx, actor, booking.branchId);
      if (booking.kind !== "DELIVERY")
        throw new ConflictException("Only delivery bookings can be dispatched.");
      const order = booking.appliedOrderId
        ? await tx.posOrder.findFirst({
            where: {
              id: booking.appliedOrderId,
              organizationId: actor.organizationId,
            },
          })
        : null;
      const dispatched =
        input.action === "DISPATCH"
          ? { status: "IN_TRANSIT", dispatchedAt: new Date() }
          : { status: "DELIVERED", deliveredAt: new Date() };
      if (input.action === "DISPATCH") {
        if (booking.status !== "CONFIRMED")
          throw new ConflictException(
            "Only a confirmed delivery booking can be dispatched.",
          );
        if (!booking.deliveryAddress)
          throw new BadRequestException(
            "A delivery address is required before dispatch.",
          );
        if (!order)
          throw new ConflictException(
            "Link a paid order to this delivery before dispatch.",
          );
        if (order.status !== "PAID")
          throw new ConflictException(
            "Settle the delivery order before dispatch.",
          );
      } else if (input.action === "COMPLETE") {
        if (booking.status !== "IN_TRANSIT" || !booking.dispatchedAt)
          throw new ConflictException(
            "Only a dispatched delivery can be completed.",
          );
        if (!order || order.status !== "PAID")
          throw new ConflictException(
            "The delivery order must be settled before completion.",
          );
      } else {
        throw new BadRequestException("Unsupported delivery action.");
      }
      const updated = await tx.serviceBooking.update({
        where: { id: bookingId },
        data: {
          status: dispatched.status,
          dispatchedAt: dispatched.dispatchedAt ?? undefined,
          deliveredAt: dispatched.deliveredAt ?? undefined,
          courierName: input.courierName ?? booking.courierName,
          version: { increment: 1 },
        },
      });
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: `service.delivery.${input.action.toLowerCase()}`,
          entityType: "ServiceBooking",
          entityId: bookingId,
          branchId: booking.branchId,
          afterValue: {
            status: dispatched.status,
            courierName: input.courierName ?? booking.courierName,
          },
          ...meta,
        },
        tx,
      );
      const result = { booking: updated };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation,
          },
        },
        data: { responseCode: 200, responseBody: result as any },
      });
      return result;
    });
  }
  async splitOrder(actor: Actor, orderId: string, input: any, key: string, meta: any) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idem(
        tx,
        actor,
        key,
        "phase4.dinein.split",
        { orderId, ...input },
      );
      if (prior) return prior;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM pos_orders WHERE id=CAST(${orderId} AS uuid) AND organization_id=CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const order = await tx.posOrder.findFirst({
        where: { id: orderId, organizationId: actor.organizationId },
        include: { payments: true, shares: true },
      });
      if (!order) throw new NotFoundException("Order not found.");
      await this.branch(tx, actor, order.branchId);
      if (order.orderType !== "DINE_IN" || !["UNPAID", "OPEN"].includes(order.status))
        throw new ConflictException(
          "Only an open dine-in order can be split.",
        );
      if (order.shares.some((s: any) => s.status !== "VOID"))
        throw new ConflictException("This order is already split.");
      const alreadyPaidMinor = order.payments
        .filter((p: any) => !p.shareId)
        .reduce((sum: number, p: any) => sum + p.amountMinor, 0);
      const outstandingMinor = Math.max(0, order.totalMinor - alreadyPaidMinor);
      const shares = input.shares ?? [];
      if (shares.length < 2)
        throw new BadRequestException("A split needs at least two shares.");
      const labels = new Set<string>();
      let summed = 0;
      for (const share of shares) {
        const label = String(share.label ?? "").trim();
        if (!label || labels.has(label))
          throw new BadRequestException("Each share needs a unique label.");
        labels.add(label);
        summed += safeAmount(share.totalMinor);
      }
      if (summed !== outstandingMinor)
        throw new BadRequestException(
          `Shares must total the remaining balance of ${outstandingMinor}.`,
        );
      await tx.posOrderShare.deleteMany({
        where: { organizationId: actor.organizationId, orderId },
      });
      const created = [];
      for (const share of shares)
        created.push(
          await tx.posOrderShare.create({
            data: {
              organizationId: actor.organizationId,
              orderId,
              label: String(share.label).trim(),
              totalMinor: safeAmount(share.totalMinor),
              createdById: actor.userId,
            },
          }),
        );
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "dinein.order.split",
          entityType: "PosOrder",
          entityId: orderId,
          branchId: order.branchId,
          afterValue: { shares: created.map((s: any) => [s.label, s.totalMinor]) },
          ...meta,
        },
        tx,
      );
      const result = { order: await tx.posOrder.findUniqueOrThrow({ where: { id: orderId }, include: { shares: true } }) };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "phase4.dinein.split",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
    });
  }
  async settleShare(
    actor: Actor,
    shareId: string,
    input: any,
    key: string,
    meta: any,
  ) {
    return this.prisma.withTenant(actor.organizationId, async (tx) => {
      const prior = await this.idem(
        tx,
        actor,
        key,
        "phase4.dinein.share.settle",
        { shareId, ...input },
      );
      if (prior) return prior;
      const known = await tx.posOrderShare.findFirst({
        where: { id: shareId, organizationId: actor.organizationId },
        select: { orderId: true },
      });
      if (!known) throw new NotFoundException("Share not found.");
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM pos_orders WHERE id=CAST(${known.orderId} AS uuid) AND organization_id=CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM pos_order_shares WHERE id=CAST(${shareId} AS uuid) AND organization_id=CAST(${actor.organizationId} AS uuid) FOR UPDATE`,
      );
      const share = await tx.posOrderShare.findFirst({
        where: { id: shareId, organizationId: actor.organizationId },
      });
      if (!share) throw new NotFoundException("Share not found.");
      const order = await tx.posOrder.findFirst({
        where: { id: share.orderId, organizationId: actor.organizationId },
        include: { table: true, shares: true, payments: true },
      });
      if (!order) throw new NotFoundException("Order not found.");
      await this.branch(tx, actor, order.branchId);
      if (order.orderType !== "DINE_IN" || !["UNPAID", "OPEN"].includes(order.status))
        throw new ConflictException("Only an open dine-in order can settle a share.");
      if (share.status !== "OPEN")
        throw new ConflictException("This share is already settled.");
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
        share.totalMinor,
      );
      const receiptNumber = `R-${String(order.orderNumber).padStart(6, "0")}-${share.label.replace(/[^A-Za-z0-9]+/g, "").slice(0, 8).toUpperCase()}`;
      await tx.posOrderPayment.createMany({
        data: payments.map((p: any) => ({
          organizationId: actor.organizationId,
          orderId: order.id,
          shareId: share.id,
          method: p.method,
          amountMinor: safeAmount(p.amountMinor),
          reference: p.reference,
          tenderKind: "MANUAL",
        })),
      });
      const settledShare = await tx.posOrderShare.update({
        where: { id: share.id },
        data: {
          status: "SETTLED",
          paidMinor: tender.paidMinor,
          settledById: actor.userId,
          settledAt: new Date(),
          receiptNumber,
        },
      });
      const allSettled = order.shares.every((s: any) =>
        s.id === share.id ? true : s.status === "SETTLED",
      );
      let receipt: any = null;
      if (allSettled) {
        const paidMinor =
          order.payments
            .filter((p: any) => !p.shareId)
            .reduce((sum: number, p: any) => sum + p.amountMinor, 0) +
          order.shares
            .filter((s: any) => s.id !== share.id && s.status === "SETTLED")
            .reduce((sum: number, s: any) => sum + s.paidMinor, 0) +
          tender.paidMinor;
        await tx.posOrder.update({
          where: { id: order.id },
          data: {
            registerId: register.id,
            status: "PAID",
            serviceStatus: "CLOSED",
            paidMinor,
            changeMinor: { increment: tender.changeMinor },
            version: { increment: 1 },
          },
        });
        receipt = await tx.posReceipt.create({
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
      } else {
        await tx.posOrder.update({
          where: { id: order.id },
          data: { registerId: register.id, version: { increment: 1 } },
        });
      }
      await this.audit.create(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          actorType: "USER",
          actorId: actor.userId,
          action: "dinein.share.settled",
          entityType: "PosOrder",
          entityId: order.id,
          branchId: order.branchId,
          afterValue: { shareId: share.id, amountMinor: tender.paidMinor },
          ...meta,
        },
        tx,
      );
      const result = {
        share: settledShare,
        receipt,
        orderStatus: allSettled ? "PAID" : order.status,
      };
      await tx.idempotencyKey.update({
        where: {
          organizationId_key_operation: {
            organizationId: actor.organizationId,
            key,
            operation: "phase4.dinein.share.settle",
          },
        },
        data: { responseCode: 201, responseBody: result as any },
      });
      return result;
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
        !["UNPAID", "OPEN"].includes(order.status) ||
        ["CLOSED", "VOID", "CANCELLED", "PAID"].includes(order.serviceStatus)
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
            roles: {
              some: {
                role: {
                  permissions: {
                    some: { permission: { key: "orders.dinein.create" } },
                  },
                },
              },
            },
          },
        });
        if (!waiter)
          throw new BadRequestException(
            "Target waiter is not active, assigned to this branch, and permitted to serve tables.",
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
        include: { table: true, tickets: true, items: true, payments: true, shares: true },
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
        include: { table: true, tickets: true, items: true, payments: true, shares: true },
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
        include: { table: true, payments: true },
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
      const previouslyPaid = order.payments.reduce(
        (sum: number, payment: any) => sum + payment.amountMinor,
        0,
      );
      const payableMinor = Math.max(0, order.totalMinor - previouslyPaid);
      if (payableMinor > 0 && !payments.length)
        throw new BadRequestException("At least one payment is required.");
      const tender = await this.pos.validateTender(
        tx,
        actor,
        payments,
        payableMinor,
      );
      const updated = await tx.posOrder.update({
        where: { id: order.id },
        data: {
          registerId: register.id,
          status: "PAID",
          serviceStatus: "CLOSED",
          paidMinor: previouslyPaid + tender.paidMinor,
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
