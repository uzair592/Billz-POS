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
  Res,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { Request, Response } from "express";
import { CurrentUser, RequirePermissions } from "../../common/auth.decorators";
import { requestMetadata } from "../../common/http";
import type { UserPrincipal } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { PermissionGuard, UserAuthGuard } from "../auth/auth.guards";
import { PosService } from "./pos.service";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).optional(),
});
const productSchema = z.object({
  name: z.string().trim().min(1).max(180),
  categoryId: z.string().uuid().optional(),
  sku: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(120).optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  isCombo: z.boolean().optional(),
  comboItems: z.array(z.record(z.unknown())).optional(),
  modifierConfig: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        priceMinor: z.number().int().nonnegative(),
        active: z.boolean().optional(),
      }),
    )
    .optional(),
  variants: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        priceMinor: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  prices: z
    .array(
      z.object({
        branchId: z.string().uuid(),
        priceMinor: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});
const registerSchema = z.object({
  branchId: z.string().uuid(),
  openingFloatMinor: z.number().int().nonnegative(),
});
const itemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  modifiers: z.array(z.object({ id: z.string().min(1) })).optional(),
});
const paymentSchema = z.object({
  method: z.string().min(1).max(40),
  amountMinor: z.number().int().positive(),
  reference: z.string().max(160).optional(),
  verifiedExternal: z.boolean().optional(),
});
const orderSchema = z.object({
  branchId: z.string().uuid(),
  registerId: z.string().uuid().optional(),
  orderType: z.string().max(30).optional(),
  taxMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]).optional(),
  taxOverrideReason: z.string().trim().min(3).max(500).optional(),
  hold: z.boolean().optional(),
  items: z.array(itemSchema).min(1),
  payments: z.array(paymentSchema).default([]),
});
const refundSchema = z.object({
  amountMinor: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  disposition: z.enum(["NO_STOCK", "RETURN_TO_STOCK", "WASTAGE"]).optional(),
});
const resumeSchema = z.object({
  registerId: z.string().uuid(),
  payments: z.array(paymentSchema).min(1),
});
const closeSchema = z.object({
  closingTotalMinor: z.number().int().nonnegative(),
});
const voidSchema = z.object({ reason: z.string().trim().min(3).max(500) });

@Controller("pos")
@UseGuards(UserAuthGuard, PermissionGuard)
export class PosController {
  constructor(private readonly service: PosService) {}
  @Get("categories") @RequirePermissions("pos.catalog.view") categories(
    @CurrentUser() u: UserPrincipal,
  ) {
    return this.service.categories(u);
  }
  @Post("categories") @RequirePermissions("pos.catalog.manage") createCategory(
    @CurrentUser() u: UserPrincipal,
    @Body(new ZodValidationPipe(categorySchema)) body: any,
    @Req() req: Request,
  ) {
    return this.service.createCategory(u, body, requestMetadata(req));
  }
  @Get("catalog") @RequirePermissions("pos.catalog.view") catalog(
    @CurrentUser() u: UserPrincipal,
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
  ) {
    return this.service.catalog(u, branchId, search, categoryId);
  }
  @Post("products") @RequirePermissions("pos.catalog.manage") createProduct(
    @CurrentUser() u: UserPrincipal,
    @Body(new ZodValidationPipe(productSchema)) body: any,
    @Req() req: Request,
  ) {
    return this.service.createProduct(u, body, requestMetadata(req));
  }
  @Get("registers") @RequirePermissions("pos.register.open") registers(
    @CurrentUser() u: UserPrincipal,
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
  ) {
    return this.service.registers(u, branchId);
  }
  @Post("registers/open") @RequirePermissions("pos.register.open") openRegister(
    @CurrentUser() u: UserPrincipal,
    @Body(new ZodValidationPipe(registerSchema)) body: any,
    @Req() req: Request,
  ) {
    return this.service.openRegister(u, body, requestMetadata(req));
  }
  @Post("registers/:id/close")
  @RequirePermissions("pos.register.open")
  closeRegister(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(closeSchema)) body: any,
    @Req() req: Request,
  ) {
    return this.service.closeRegister(
      u,
      id,
      body.closingTotalMinor,
      requestMetadata(req),
    );
  }
  @Post("quote") @RequirePermissions("pos.sale.create") quote(
    @CurrentUser() u: UserPrincipal,
    @Body(new ZodValidationPipe(orderSchema)) body: any,
  ) {
    return this.service.preview(u, body);
  }
  @Post("orders") @RequirePermissions("pos.sale.create") createOrder(
    @CurrentUser() u: UserPrincipal,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(orderSchema)) body: any,
    @Req() req: Request,
  ) {
    return this.service.createOrder(u, body, key, requestMetadata(req));
  }
  @Get("history") @RequirePermissions("pos.sale.history") history(
    @CurrentUser() u: UserPrincipal,
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
  ) {
    return this.service.history(u, branchId);
  }
  @Get("orders/:id") @RequirePermissions("pos.sale.history") order(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.order(u, id);
  }
  @Post("orders/:id/refund") @RequirePermissions("pos.sale.refund") refund(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(refundSchema)) body: any,
    @Req() req: Request,
  ) {
    return this.service.refund(u, id, body, key, requestMetadata(req));
  }
  @Post("orders/:id/resume") @RequirePermissions("pos.sale.create") resume(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(resumeSchema)) body: any,
    @Req() req: Request,
  ) {
    return this.service.resumeOrder(u, id, body, key, requestMetadata(req));
  }
  @Post("orders/:id/void") @RequirePermissions("pos.sale.void") voidOrder(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(voidSchema)) body: any,
    @Req() req: Request,
  ) {
    return this.service.voidOrder(
      u,
      id,
      body.reason,
      key,
      requestMetadata(req),
    );
  }
  @Get("orders/:id/receipt")
  @RequirePermissions("pos.sale.reprint")
  async receipt(
    @CurrentUser() u: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("format") format: string,
    @Res() response: Response,
  ) {
    const order: any = await this.service.receipt(u, id);
    const text = this.receiptText(order);
    if (format === "pdf") {
      response.type("application/pdf").send(this.pdf(text));
      return;
    }
    response
      .type("html")
      .send(
        `<html><head><meta charset="utf-8"><title>Receipt ${this.escape(String(order.receipt.receiptNumber))}</title><style>@page{size:80mm auto;margin:2mm}body{width:72mm;font:12px monospace;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>${this.escape(text)}</body></html>`,
      );
  }
  private receiptText(order: any) {
    const money = (minor: number) =>
      `PKR ${(minor / 100).toFixed(2)} (${minor})`;
    const itemLines = order.items.flatMap((item: any) => {
      const modifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
      const modifierLine = modifiers.length
        ? [
            `  Modifiers: ${modifiers.map((m: any) => `${m.name} +${money(m.priceMinor)}`).join(", ")}`,
          ]
        : [];
      return [
        `${item.nameSnapshot} x${item.quantity}  ${money(item.lineTotalMinor)}`,
        ...modifierLine,
      ];
    });
    const tenders = order.payments.map(
      (payment: any) =>
        `Tender ${payment.method}: ${money(payment.amountMinor)}`,
    );
    return [
      order.organization?.legalName || order.organization?.name || "Business",
      order.branch ? `${order.branch.name} (${order.branch.code})` : "",
      order.organization?.phone || order.organization?.email || "",
      `Order #${order.orderNumber}  ${new Date(order.createdAt).toISOString()}`,
      `Receipt ${order.receipt.receiptNumber}`,
      "",
      ...itemLines,
      "",
      `Subtotal: ${money(order.subtotalMinor)}`,
      `Tax (${order.taxMode}): ${money(order.taxMinor)}`,
      `Total: ${money(order.totalMinor)}`,
      ...tenders,
      `Tender total: ${money(order.paidMinor)}`,
      `Change: ${money(order.changeMinor)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  private escape(value: string) {
    return value.replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
    );
  }
  private pdf(body: string) {
    const text = body.replace(/[()\\]/g, "\\$&");
    const stream = `BT /F1 10 Tf 40 760 Td (${text.replace(/\n/g, ") Tj 0 -14 Td (")}) Tj ET`;
    const objects = [
      `<< /Type /Catalog /Pages 2 0 R >>`,
      `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 226 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, "0")} 00000 n `)
      .join(
        "\n",
      )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf);
  }
}
