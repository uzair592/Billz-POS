import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, RequirePermissions } from "../../common/auth.decorators";
import { requestMetadata } from "../../common/http";
import type { UserPrincipal } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { PermissionGuard, UserAuthGuard } from "../auth/auth.guards";
import { Phase4Service } from "./phase4.service";

const branch = z.object({ branchId: z.string().uuid() });
const table = branch.extend({
  name: z.string().trim().min(1).max(80),
  capacity: z.number().int().min(1).max(100).optional(),
});
const station = branch.extend({ name: z.string().trim().min(1).max(100) });
const order = branch.extend({
  tableId: z.string().uuid(),
  stationId: z.string().uuid(),
  items: z.array(z.record(z.unknown())).min(1),
});
const additions = z.object({
  stationId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  items: z.array(z.record(z.unknown())).min(1),
});
const ready = z.object({ expectedVersion: z.number().int().positive() });
const settle = z.object({
  registerId: z.string().uuid(),
  payments: z
    .array(
      z.object({
        method: z.string().min(1).max(40),
        amountMinor: z.number().int().positive(),
        reference: z.string().max(160).optional(),
      }),
    )
    .min(1),
});
const transfer = z.object({
  tableId: z.string().uuid(),
  waiterId: z.string().uuid().optional(),
});
const booking = branch.extend({
  tableId: z.string().uuid().optional(),
  kind: z.enum(["RESERVATION", "WAITLIST", "ADVANCE_TAKEAWAY", "DELIVERY"]),
  status: z.string().max(30).optional(),
  customerName: z.string().trim().min(1).max(150),
  contact: z.string().max(100).optional(),
  partySize: z.number().int().positive(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().max(500).optional(),
  details: z.record(z.unknown()).optional(),
  depositMinor: z.number().int().nonnegative().optional(),
});
const applyDeposit = z.object({ orderId: z.string().uuid() });

@Controller("phase4")
@UseGuards(UserAuthGuard, PermissionGuard)
export class Phase4Controller {
  constructor(private readonly service: Phase4Service) {}
  @Get("tables") @RequirePermissions("tables.view") tables(
    @CurrentUser() u: UserPrincipal,
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
  ) {
    return this.service.tables(u, branchId);
  }
  @Post("tables") @RequirePermissions("tables.manage") createTable(
    @CurrentUser() u: UserPrincipal,
    @Body(new ZodValidationPipe(table)) body: any,
  ) {
    return this.service.createTable(u, body);
  }
  @Get("stations") @RequirePermissions("kitchen.stations.view") stations(
    @CurrentUser() u: UserPrincipal,
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
  ) {
    return this.service.stations(u, branchId);
  }
  @Post("stations") @RequirePermissions("tables.manage") createStation(
    @CurrentUser() u: UserPrincipal,
    @Body(new ZodValidationPipe(station)) body: any,
  ) {
    return this.service.createStation(u, body);
  }
  @Post("dine-in/orders") @RequirePermissions("orders.dinein.create") open(
    @CurrentUser() u: UserPrincipal,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(order)) body: any,
    @Req() req: any,
  ) {
    return this.service.openOrder(u, body, key, requestMetadata(req));
  }
  @Post("dine-in/orders/:id/additions")
  @RequirePermissions("orders.dinein.send")
  add(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(additions)) body: any,
    @Req() req: any,
  ) {
    return this.service.addItems(u, id, body, key, requestMetadata(req));
  }
  @Get("dine-in/open") @RequirePermissions("orders.dinein.create") waiterOrders(
    @CurrentUser() u: UserPrincipal,
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
  ) {
    return this.service.waiterOrders(u, branchId);
  }
  @Get("dine-in/orders/:id") @RequirePermissions("orders.dinein.create") get(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.getOrder(u, id);
  }
  @Get("dine-in/orders") @RequirePermissions("orders.dinein.settle") openOrders(
    @CurrentUser() u: UserPrincipal,
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
  ) {
    return this.service.openOrders(u, branchId);
  }
  @Get("kitchen/tickets") @RequirePermissions("kitchen.tickets.view") tickets(
    @CurrentUser() u: UserPrincipal,
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
    @Query("stationId", new ParseUUIDPipe()) stationId: string,
  ) {
    return this.service.tickets(u, branchId, stationId);
  }
  @Post("kitchen/tickets/:id/ready")
  @RequirePermissions("kitchen.tickets.ready")
  readyTicket(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(ready)) body: any,
    @Req() req: any,
  ) {
    return this.service.ready(
      u,
      id,
      body.expectedVersion,
      key,
      requestMetadata(req),
    );
  }
  @Get("kitchen/catchup") @RequirePermissions("kitchen.tickets.view") catchup(
    @CurrentUser() u: UserPrincipal,
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
    @Query("after") after?: string,
  ) {
    return this.service.catchup(u, branchId, after);
  }
  @Post("dine-in/orders/:id/settle")
  @RequirePermissions("orders.dinein.settle")
  settleOrder(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(settle)) body: any,
    @Req() req: any,
  ) {
    return this.service.settle(u, id, body, key, requestMetadata(req));
  }
  @Post("dine-in/orders/:id/transfer")
  @RequirePermissions("orders.dinein.transfer")
  transferOrder(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(transfer)) body: any,
    @Req() req: any,
  ) {
    return this.service.transfer(u, id, body, key, requestMetadata(req));
  }
  @Get("bookings") @RequirePermissions("reservations.view") bookings(
    @CurrentUser() u: UserPrincipal,
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
  ) {
    return this.service.bookings(u, branchId);
  }
  @Post("bookings") @RequirePermissions("reservations.manage") createBooking(
    @CurrentUser() u: UserPrincipal,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(booking)) body: any,
    @Req() req: any,
  ) {
    return this.service.createBooking(u, body, key, requestMetadata(req));
  }
  @Post("bookings/:id/apply-deposit")
  @RequirePermissions("reservations.manage")
  applyDeposit(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(applyDeposit)) body: any,
    @Req() req: any,
  ) {
    return this.service.applyDeposit(
      u,
      id,
      body.orderId,
      key,
      requestMetadata(req),
    );
  }
}
