import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AppModule } from "../src/app.module";
import { hashPassword } from "../src/common/security";

const run =
  process.env.RUN_DATABASE_TESTS === "true" ? describe : describe.skip;
run("Phase 3 POS acceptance", () => {
  let app: INestApplication;
  const db = new PrismaClient();
  let admin: ReturnType<typeof request.agent>;
  let adminCsrf = "";
  let owner: ReturnType<typeof request.agent>;
  let ownerCsrf = "";
  let other: ReturnType<typeof request.agent>;
  let otherCsrf = "";
  let orgId = "";
  let otherOrgId = "";
  let branchA = "";
  let branchB = "";
  let otherBranch = "";
  let productId = "";
  let registerId = "";
  const suffix = randomUUID().slice(0, 8);
  const adminPassword = "Phase3-Admin-2026!";
  const ownerPassword = "Phase3-Owner-2026!";
  const init = async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    await app.init();
  };
  const ownerLogin = async (
    agent: ReturnType<typeof request.agent>,
    username: string,
  ) => {
    let result = await agent
      .post("/api/v1/auth/login")
      .send({ identifier: username, password: ownerPassword });
    if (result.body.user?.mustChangePassword) {
      const csrf = result.body.csrfToken;
      await agent
        .post("/api/v1/auth/change-temporary-password")
        .set("x-csrf-token", csrf)
        .send({
          currentPassword: ownerPassword,
          newPassword: `${ownerPassword}New`,
        })
        .expect(201);
      result = await agent
        .post("/api/v1/auth/login")
        .send({ identifier: username, password: `${ownerPassword}New` });
    }
    return result;
  };
  beforeAll(async () => {
    await init();
    await db.permission.findMany();
    await db.platformAdmin.create({
      data: {
        email: `phase3-${suffix}@example.test`,
        name: "Phase 3 Admin",
        passwordHash: await hashPassword(adminPassword),
      },
    });
    const plan = await db.subscriptionPlan.create({
      data: {
        code: `phase3-${suffix}`,
        name: "Phase 3",
        maxBranches: 5,
        maxUsers: 20,
        maxDevices: 5,
      },
    });
    admin = request.agent(app.getHttpServer());
    const adminLogin = await admin
      .post("/api/v1/platform/auth/login")
      .send({ email: `phase3-${suffix}@example.test`, password: adminPassword })
      .expect(201);
    adminCsrf = adminLogin.body.csrfToken;
    const provision = async (name: string, username: string) => {
      const response = await admin
        .post("/api/v1/platform/organizations")
        .set("x-csrf-token", adminCsrf)
        .send({
          name,
          businessType: "CAFE",
          email: `${username}@example.test`,
          phone: "03001234567",
          ownerName: "Phase 3 Owner",
          ownerUsername: username,
          temporaryPassword: ownerPassword,
          planId: plan.id,
          moduleIds: [],
        })
        .expect(201);
      return response.body.id as string;
    };
    orgId = await provision(`Phase 3 A ${suffix}`, `p3a-${suffix}`);
    otherOrgId = await provision(`Phase 3 B ${suffix}`, `p3b-${suffix}`);
    owner = request.agent(app.getHttpServer());
    other = request.agent(app.getHttpServer());
    const aLogin = await ownerLogin(owner, `p3a-${suffix}`);
    ownerCsrf = aLogin.body.csrfToken;
    const bLogin = await ownerLogin(other, `p3b-${suffix}`);
    otherCsrf = bLogin.body.csrfToken;
    branchA = (await owner.get("/api/v1/branches").expect(200)).body[0].id;
    otherBranch = (await other.get("/api/v1/branches").expect(200)).body[0].id;
    branchB = (
      await owner
        .post("/api/v1/branches")
        .set("x-csrf-token", ownerCsrf)
        .send({ name: "Second Branch", code: `B-${suffix}` })
        .expect(201)
    ).body.id;
    await owner
      .put("/api/v1/onboarding/settings")
      .set("x-csrf-token", ownerCsrf)
      .send({
        countryCode: "PK",
        currencyCode: "PKR",
        timezone: "Asia/Karachi",
        locale: "en",
        dateFormat: "DD-MM-YYYY",
        accentColor: "#0f766e",
        taxConfig: { mode: "EXCLUSIVE" },
        serviceConfig: {},
        orderTypes: ["TAKEAWAY"],
        receiptConfig: {},
      })
      .expect(200);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });
  it("creates a branch-priced product with a modifier and rejects cross-tenant references", async () => {
    const created = await owner
      .post("/api/v1/pos/products")
      .set("x-csrf-token", ownerCsrf)
      .send({
        name: "Phase 3 Latte",
        taxRateBps: 1000,
        modifierConfig: [
          { id: "oat", name: "Oat milk", priceMinor: 100, active: true },
        ],
        prices: [
          { branchId: branchA, priceMinor: 1000 },
          { branchId: branchB, priceMinor: 1200 },
        ],
      })
      .expect(201);
    productId = created.body.id;
    await owner
      .post("/api/v1/pos/quote")
      .set("x-csrf-token", ownerCsrf)
      .send({
        branchId: branchA,
        items: [{ productId: productId, quantity: 1 }],
      })
      .expect(201);
    const otherProduct = await other
      .post("/api/v1/pos/products")
      .set("x-csrf-token", otherCsrf)
      .send({
        name: "Other product",
        prices: [{ branchId: otherBranch, priceMinor: 500 }],
      })
      .expect(201);
    await owner
      .post("/api/v1/pos/quote")
      .set("x-csrf-token", ownerCsrf)
      .send({
        branchId: branchA,
        items: [{ productId: otherProduct.body.id, quantity: 1 }],
      })
      .expect(400);
  });
  it("enforces assigned branch, inclusive/exclusive tax and modifier pricing", async () => {
    const role = await db.role.findFirstOrThrow({
      where: { organizationId: orgId, key: "cashier" },
    });
    const user = await owner
      .post("/api/v1/users")
      .set("x-csrf-token", ownerCsrf)
      .send({
        name: "Scoped Cashier",
        username: `cash-${suffix}`,
        email: `cash-${suffix}@example.test`,
        temporaryPassword: ownerPassword,
        roleIds: [role.id],
        branchIds: [branchA],
      })
      .expect(201);
    expect(user.body.username).toContain("cash-");
    const cashier = request.agent(app.getHttpServer());
    const login = await cashier
      .post("/api/v1/auth/login")
      .send({ identifier: `cash-${suffix}`, password: ownerPassword })
      .expect(201);
    const cashierCsrf = login.body.csrfToken;
    await cashier
      .post("/api/v1/auth/change-temporary-password")
      .set("x-csrf-token", cashierCsrf)
      .send({
        currentPassword: ownerPassword,
        newPassword: `${ownerPassword}Cash`,
      })
      .expect(201);
    const cashierLogin = await cashier
      .post("/api/v1/auth/login")
      .send({ identifier: `cash-${suffix}`, password: `${ownerPassword}Cash` })
      .expect(201);
    const activeCashierCsrf = cashierLogin.body.csrfToken;
    await cashier
      .post("/api/v1/pos/quote")
      .set("x-csrf-token", activeCashierCsrf)
      .send({ branchId: branchB, items: [{ productId, quantity: 1 }] })
      .expect(403);
    await cashier
      .post("/api/v1/pos/quote")
      .set("x-csrf-token", activeCashierCsrf)
      .send({
        branchId: branchA,
        items: [{ productId, quantity: 1 }],
        taxMode: "INCLUSIVE",
        taxOverrideReason: "unauthorized attempt",
      })
      .expect(403);
    const exclusive = await owner
      .post("/api/v1/pos/quote")
      .set("x-csrf-token", ownerCsrf)
      .send({
        branchId: branchA,
        items: [{ productId, quantity: 1, modifiers: [{ id: "oat" }] }],
        taxMode: "EXCLUSIVE",
        taxOverrideReason: "Acceptance tax comparison",
      })
      .expect(201);
    expect(exclusive.body.subtotalMinor).toBe(1100);
    expect(exclusive.body.taxMinor).toBe(110);
    const inclusive = await owner
      .post("/api/v1/pos/quote")
      .set("x-csrf-token", ownerCsrf)
      .send({
        branchId: branchA,
        items: [{ productId, quantity: 1, modifiers: [{ id: "oat" }] }],
        taxMode: "INCLUSIVE",
        taxOverrideReason: "Acceptance tax comparison",
      })
      .expect(201);
    expect(inclusive.body.totalMinor).toBe(1100);
    expect(inclusive.body.taxMinor).toBe(100);
  });
  it("serializes concurrent register opening and supports split tender idempotent checkout", async () => {
    const attempts = await Promise.all([
      owner
        .post("/api/v1/pos/registers/open")
        .set("x-csrf-token", ownerCsrf)
        .send({ branchId: branchA, openingFloatMinor: 1000 }),
      owner
        .post("/api/v1/pos/registers/open")
        .set("x-csrf-token", ownerCsrf)
        .send({ branchId: branchA, openingFloatMinor: 1000 }),
    ]);
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
    registerId = attempts.find((r) => r.status === 201)!.body.id;
    const body = {
      branchId: branchA,
      registerId,
      items: [{ productId, quantity: 1, modifiers: [{ id: "oat" }] }],
      payments: [
        { method: "CASH", amountMinor: 605 },
        { method: "MANUAL_CARD", amountMinor: 605 },
      ],
    };
    const first = await owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `order-${suffix}`)
      .send(body)
      .expect(201);
    const retry = await owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `order-${suffix}`)
      .send(body)
      .expect(201);
    expect(retry.body.id).toBe(first.body.id);
    const htmlReceipt = await owner
      .get(`/api/v1/pos/orders/${first.body.id}/receipt`)
      .expect(200)
      .expect("Content-Type", /text\/html/);
    expect(htmlReceipt.text).toContain("Phase 3 A");
    expect(htmlReceipt.text).toContain("Main Branch");
    expect(htmlReceipt.text).toContain(`Order #${first.body.orderNumber}`);
    expect(htmlReceipt.text).toContain("Phase 3 Latte");
    expect(htmlReceipt.text).toContain("Oat milk");
    expect(htmlReceipt.text).toContain("Tender CASH");
    expect(htmlReceipt.text).toContain("Tender MANUAL_CARD");
    expect(htmlReceipt.text).toContain("Change: PKR 0.00 (0)");
    const pdfReceipt = await owner
      .get(`/api/v1/pos/orders/${first.body.id}/receipt?format=pdf`)
      .expect(200)
      .expect("Content-Type", /application\/pdf/);
    const pdfText = pdfReceipt.body.toString("latin1");
    expect(pdfText).toContain("Phase 3 A");
    expect(pdfText).toContain("Phase 3 Latte");
    expect(pdfText).toContain("Oat milk");
    expect(pdfText).toContain("Tender CASH");
    expect(pdfText).toContain("Tender MANUAL_CARD");
    await owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `order-${suffix}`)
      .send({ ...body, payments: [{ method: "CASH", amountMinor: 1210 }] })
      .expect(409);
    await owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `invalid-split-${suffix}`)
      .send({
        branchId: branchA,
        registerId,
        items: [{ productId, quantity: 1 }],
        payments: [
          { method: "CASH", amountMinor: 1 },
          { method: "MANUAL_CARD", amountMinor: 1200 },
        ],
      })
      .expect(400);
    const uncertainKey = `uncertain-${suffix}`;
    const uncertainBody = {
      branchId: branchA,
      registerId,
      items: [{ productId, quantity: 1 }],
      payments: [{ method: "CASH", amountMinor: 1100 }],
    };
    await owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", uncertainKey)
      .send(uncertainBody);
    const uncertainRetry = await owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", uncertainKey)
      .send(uncertainBody)
      .expect(201);
    expect(
      await db.posOrder.count({
        where: { organizationId: orgId, id: uncertainRetry.body.id },
      }),
    ).toBe(1);
    expect(uncertainRetry.body.receipt.id).toBeTruthy();
  });
  it("keeps concurrent order numbers unique, preserves receipt after price change/restart, and caps refunds", async () => {
    const make = (key: string) =>
      owner
        .post("/api/v1/pos/orders")
        .set("x-csrf-token", ownerCsrf)
        .set("Idempotency-Key", key)
        .send({
          branchId: branchA,
          registerId,
          items: [{ productId, quantity: 1 }],
          payments: [{ method: "CASH", amountMinor: 1100 }],
        });
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => make(`concurrent-${suffix}-${i}`)),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.orderNumber)).size).toBe(4);
    const receipt = results[0]!.body;
    await db.productPrice.updateMany({
      where: { organizationId: orgId, productId },
      data: { priceMinor: 9999 },
    });
    await app.close();
    await init();
    const persisted = await owner
      .get(`/api/v1/pos/orders/${receipt.id}`)
      .expect(200);
    expect(persisted.body.items[0].unitPriceMinor).not.toBe(9999);
    const historicalReceipt = await owner
      .get(`/api/v1/pos/orders/${receipt.id}/receipt`)
      .expect(200);
    expect(historicalReceipt.text).toContain("Phase 3 Latte");
    expect(historicalReceipt.text).toContain("PKR 11.00 (1100)");
    const allCard = await owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `all-card-${suffix}`)
      .send({
        branchId: branchA,
        registerId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "MANUAL_CARD", amountMinor: 10999 }],
      })
      .expect(201);
    expect(allCard.body.changeMinor).toBe(0);
    const cashOverpay = await owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `cash-overpay-${suffix}`)
      .send({
        branchId: branchA,
        registerId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "CASH", amountMinor: 20000 }],
      })
      .expect(201);
    expect(cashOverpay.body.changeMinor).toBe(9001);
    const concurrentRefunds = await Promise.all([
      owner
        .post(`/api/v1/pos/orders/${cashOverpay.body.id}/refund`)
        .set("x-csrf-token", ownerCsrf)
        .set("Idempotency-Key", `refund-race-a-${suffix}`)
        .send({ amountMinor: 10999, reason: "Race refund A" }),
      owner
        .post(`/api/v1/pos/orders/${cashOverpay.body.id}/refund`)
        .set("x-csrf-token", ownerCsrf)
        .set("Idempotency-Key", `refund-race-b-${suffix}`)
        .send({ amountMinor: 10999, reason: "Race refund B" }),
    ]);
    expect(concurrentRefunds.map((r) => r.status).sort()).toEqual([201, 400]);
    await owner
      .post(`/api/v1/pos/orders/${cashOverpay.body.id}/refund`)
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `refund-over-${suffix}`)
      .send({ amountMinor: 1, reason: "Refund beyond retained sale" })
      .expect(400);
    const refunded = await owner
      .post(`/api/v1/pos/orders/${receipt.id}/refund`)
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `refund-${suffix}`)
      .send({
        amountMinor: 100,
        reason: "Customer returned drink",
        disposition: "NO_STOCK",
      })
      .expect(201);
    expect(refunded.body.refund.amountMinor).toBe(100);
    await owner
      .post(`/api/v1/pos/orders/${receipt.id}/refund`)
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `refund-too-${suffix}`)
      .send({ amountMinor: 999999, reason: "Too much" })
      .expect(400);
    await owner
      .get(`/api/v1/pos/orders/${receipt.id}/receipt?format=pdf`)
      .expect(200)
      .expect("Content-Type", /application\/pdf/);
    const held = await owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `hold-${suffix}`)
      .send({
        branchId: branchA,
        registerId,
        hold: true,
        items: [{ productId, quantity: 1 }],
        payments: [],
      })
      .expect(201);
    await owner
      .post(`/api/v1/pos/orders/${held.body.id}/resume`)
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `resume-invalid-split-${suffix}`)
      .send({
        registerId,
        payments: [
          { method: "CASH", amountMinor: 1 },
          { method: "MANUAL_CARD", amountMinor: 1200 },
        ],
      })
      .expect(400);
    await owner
      .post(`/api/v1/pos/orders/${held.body.id}/resume`)
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `resume-${suffix}`)
      .send({ registerId, payments: [{ method: "CASH", amountMinor: 10999 }] })
      .expect(201);
    const voided = await owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `hold-void-${suffix}`)
      .send({
        branchId: branchA,
        registerId,
        hold: true,
        items: [{ productId, quantity: 1 }],
        payments: [],
      })
      .expect(201);
    await owner
      .post(`/api/v1/pos/orders/${voided.body.id}/void`)
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `void-${suffix}`)
      .send({ reason: "Customer cancelled before payment" })
      .expect(201);
    const raceOrder = owner
      .post("/api/v1/pos/orders")
      .set("x-csrf-token", ownerCsrf)
      .set("Idempotency-Key", `close-race-${suffix}`)
      .send({
        branchId: branchA,
        registerId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "CASH", amountMinor: 9999 }],
      });
    const raceClose = owner
      .post(`/api/v1/pos/registers/${registerId}/close`)
      .set("x-csrf-token", ownerCsrf)
      .send({ closingTotalMinor: 5000 });
    const [saleRace, closeRace] = await Promise.all([raceOrder, raceClose]);
    expect(closeRace.status).toBe(201);
    expect([201, 400]).toContain(saleRace.status);
  });
  it("covers expired-seat reacquisition and restricted-owner reactivation regressions", async () => {
    await db.subscriptionPlan.updateMany({
      where: { code: `phase3-${suffix}` },
      data: { maxDevices: 4 },
    });
    const second = request.agent(app.getHttpServer());
    const third = request.agent(app.getHttpServer());
    await second
      .post("/api/v1/auth/login")
      .send({ identifier: `p3a-${suffix}`, password: `${ownerPassword}New` })
      .expect(201);
    await third
      .post("/api/v1/auth/login")
      .send({ identifier: `p3a-${suffix}`, password: `${ownerPassword}New` })
      .expect(201);
    await db.subscriptionPlan.updateMany({
      where: { code: `phase3-${suffix}` },
      data: { maxDevices: 3 },
    });
    const devices = await db.organizationDevice.findMany({
      where: { organizationId: orgId },
      orderBy: { firstSeenAt: "asc" },
    });
    await db.organizationDevice.update({
      where: { id: devices[0]!.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    await owner
      .post("/api/v1/auth/login")
      .send({ identifier: `p3a-${suffix}`, password: `${ownerPassword}New` })
      .expect(403);
    await db.organizationSubscription.updateMany({
      where: { organizationId: otherOrgId },
      data: {
        endsAt: new Date(Date.now() - 1000),
        graceEndsAt: new Date(Date.now() - 1000),
      },
    });
    const restricted = request.agent(app.getHttpServer());
    await restricted
      .post("/api/v1/auth/login")
      .send({ identifier: `p3b-${suffix}`, password: `${ownerPassword}New` })
      .expect(201);
    await db.organizationSubscription.updateMany({
      where: { organizationId: otherOrgId },
      data: {
        endsAt: new Date(Date.now() + 86400000),
        graceEndsAt: new Date(Date.now() + 86400000),
        status: "ACTIVE",
      },
    });
    await restricted.get("/api/v1/organization").expect(401);
  });
});
