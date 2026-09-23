import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { Request } from "express";
import { CurrentUser, RequirePermissions } from "../../common/auth.decorators";
import { requestMetadata } from "../../common/http";
import type { UserPrincipal } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { PermissionGuard, UserAuthGuard } from "../auth/auth.guards";
import { PosService } from "./pos.service";

const productSchema = z.object({ name: z.string().trim().min(1).max(180), categoryId: z.string().uuid().optional(), sku: z.string().trim().max(80).optional(), barcode: z.string().trim().max(120).optional(), taxRateBps: z.number().int().min(0).max(10000).optional(), isCombo: z.boolean().optional(), comboItems: z.array(z.record(z.unknown())).optional(), modifierConfig: z.array(z.record(z.unknown())).optional(), variants: z.array(z.object({ name: z.string().trim().min(1), priceMinor: z.number().int().nonnegative() })).default([]), prices: z.array(z.object({ branchId: z.string().uuid(), priceMinor: z.number().int().nonnegative() })).min(1) });
const registerSchema = z.object({ branchId: z.string().uuid(), openingFloatMinor: z.number().int().nonnegative() });
const orderSchema = z.object({ branchId: z.string().uuid(), registerId: z.string().uuid().optional(), orderType: z.string().max(30).optional(), items: z.array(z.object({ productId: z.string().uuid(), variantId: z.string().uuid().optional(), quantity: z.number().int().positive(), modifiers: z.array(z.record(z.unknown())).optional() })).min(1), payments: z.array(z.object({ method: z.string().min(1).max(40), amountMinor: z.number().int().positive(), reference: z.string().max(160).optional() })).min(1) });

@Controller("pos") @UseGuards(UserAuthGuard, PermissionGuard)
export class PosController {
  constructor(private readonly service: PosService) {}
  @Get("catalog") @RequirePermissions("organization.view") catalog(@CurrentUser() u: UserPrincipal, @Query("branchId", new ParseUUIDPipe()) branchId: string) { return this.service.catalog(u, branchId); }
  @Post("products") @RequirePermissions("products.manage") createProduct(@CurrentUser() u: UserPrincipal, @Body(new ZodValidationPipe(productSchema)) body: any, @Req() req: Request) { return this.service.createProduct(u, body, requestMetadata(req)); }
  @Post("registers/open") @RequirePermissions("organization.view") openRegister(@CurrentUser() u: UserPrincipal, @Body(new ZodValidationPipe(registerSchema)) body: any, @Req() req: Request) { return this.service.openRegister(u, body, requestMetadata(req)); }
  @Post("orders") @RequirePermissions("organization.view") createOrder(@CurrentUser() u: UserPrincipal, @Body(new ZodValidationPipe(orderSchema)) body: any, @Req() req: Request) { return this.service.createOrder(u, body, requestMetadata(req)); }
  @Get("orders/:id") @RequirePermissions("organization.view") order(@CurrentUser() u: UserPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.service.order(u, id); }
}
