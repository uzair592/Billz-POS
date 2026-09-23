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
run("Phase 4 dine-in acceptance", () => {
  let app: INestApplication;
  const db = new PrismaClient();
  let admin: ReturnType<typeof request.agent>;
  let owner: ReturnType<typeof request.agent>;
  let csrf = "";
  let orgId = "";
  let branchId = "";
  let productId = "";
  let tableId = "";
  let stationId = "";
  let registerId = "";
  const suffix = randomUUID().slice(0, 8);
  const password = "Phase4-Owner-2026!";
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    await app.init();
    const adminPassword = "Phase4-Admin-2026!";
    await db.platformAdmin.create({
      data: {
        email: `p4-${suffix}@example.test`,
        name: "P4",
        passwordHash: await hashPassword(adminPassword),
      },
    });
    const plan = await db.subscriptionPlan.create({
      data: {
        code: `p4-${suffix}`,
        name: "P4",
        maxBranches: 5,
        maxUsers: 20,
        maxDevices: 5,
      },
    });
    admin = request.agent(app.getHttpServer());
    const al = await admin
      .post("/api/v1/platform/auth/login")
      .send({ email: `p4-${suffix}@example.test`, password: adminPassword })
      .expect(201);
    const provision = await admin
      .post("/api/v1/platform/organizations")
      .set("x-csrf-token", al.body.csrfToken)
      .send({
        name: `P4 ${suffix}`,
        businessType: "CAFE",
        email: `owner-${suffix}@example.test`,
        phone: "03001234567",
        ownerName: "P4 Owner",
        ownerUsername: `p4owner-${suffix}`,
        temporaryPassword: password,
        planId: plan.id,
        moduleIds: [],
      })
      .expect(201);
    orgId = provision.body.id;
    owner = request.agent(app.getHttpServer());
    let login = await owner
      .post("/api/v1/auth/login")
      .send({ identifier: `p4owner-${suffix}`, password })
      .expect(201);
    csrf = login.body.csrfToken;
    if (login.body.user?.mustChangePassword) {
      await owner
        .post("/api/v1/auth/change-temporary-password")
        .set("x-csrf-token", csrf)
        .send({ currentPassword: password, newPassword: `${password}New` })
        .expect(201);
      login = await owner
        .post("/api/v1/auth/login")
        .send({ identifier: `p4owner-${suffix}`, password: `${password}New` })
        .expect(201);
      csrf = login.body.csrfToken;
    }
    branchId = (await owner.get("/api/v1/branches").expect(200)).body[0].id;
    productId = (
      await owner
        .post("/api/v1/pos/products")
        .set("x-csrf-token", csrf)
        .send({
          name: "Dine-in Coffee",
          prices: [{ branchId, priceMinor: 1000 }],
          modifierConfig: [
            { id: "oat", name: "Oat", priceMinor: 100, active: true },
          ],
        })
        .expect(201)
    ).body.id;
    tableId = (
      await owner
        .post("/api/v1/phase4/tables")
        .set("x-csrf-token", csrf)
        .send({ branchId, name: "T1", capacity: 2 })
        .expect(201)
    ).body.id;
    stationId = (
      await owner
        .post("/api/v1/phase4/stations")
        .set("x-csrf-token", csrf)
        .send({ branchId, name: "Hot" })
        .expect(201)
    ).body.id;
    registerId = (
      await owner
        .post("/api/v1/pos/registers/open")
        .set("x-csrf-token", csrf)
        .send({ branchId, openingFloatMinor: 0 })
        .expect(201)
    ).body.id;
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });
  it("serializes competing opens and preserves one ticket/outbox", async () => {
    const body = {
      branchId,
      tableId,
      stationId,
      items: [
        {
          productId,
          quantity: 1,
          modifiers: [{ id: "oat" }],
          notes: "No sugar",
        },
      ],
    };
    const [a, b] = await Promise.all([
      owner
        .post("/api/v1/phase4/dine-in/orders")
        .set("x-csrf-token", csrf)
        .set("Idempotency-Key", randomUUID())
        .send(body),
      owner
        .post("/api/v1/phase4/dine-in/orders")
        .set("x-csrf-token", csrf)
        .set("Idempotency-Key", randomUUID())
        .send(body),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const orderId = a.status === 201 ? a.body.order.id : b.body.order.id;
    const counts = await db.$queryRaw<
      any[]
    >`SELECT (SELECT count(*) FROM pos_orders WHERE id=${orderId}::uuid) orders, (SELECT count(*) FROM kitchen_tickets WHERE order_id=${orderId}::uuid) tickets, (SELECT count(*) FROM kitchen_outbox WHERE ticket_id IN (SELECT id FROM kitchen_tickets WHERE order_id=${orderId}::uuid)) outbox`;
    expect(Number(counts[0].orders)).toBe(1);
    expect(Number(counts[0].tickets)).toBe(1);
    expect(Number(counts[0].outbox)).toBe(1);
    const retry = await owner
      .post("/api/v1/phase4/dine-in/orders")
      .set("x-csrf-token", csrf)
      .set("Idempotency-Key", "retry-open-123")
      .send(body);
    expect(retry.status).toBe(409);
  });
  it("rejects non-dine-in settlement and settles eligible order once", async () => {
    const order = await db.posOrder.findFirstOrThrow({
      where: { organizationId: orgId, orderType: "DINE_IN" },
    });
    const result = await owner
      .post(`/api/v1/phase4/dine-in/orders/${order.id}/settle`)
      .set("x-csrf-token", csrf)
      .set("Idempotency-Key", randomUUID())
      .send({
        registerId,
        payments: [{ method: "CASH", amountMinor: order.totalMinor }],
      })
      .expect(201);
    expect(result.body.order.changeMinor).toBe(0);
    await expect(
      owner
        .post(`/api/v1/phase4/dine-in/orders/${order.id}/settle`)
        .set("x-csrf-token", csrf)
        .set("Idempotency-Key", randomUUID())
        .send({
          registerId,
          payments: [{ method: "CASH", amountMinor: order.totalMinor }],
        }),
    ).resolves.toMatchObject({ status: 409 });
    const rows = await db.posOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { payments: true, receipt: true, table: true, items: true },
    });
    expect(rows.payments).toHaveLength(1);
    expect(rows.receipt).not.toBeNull();
    expect(rows.table?.status).toBe("AVAILABLE");
    expect(rows.items[0]?.notesSnapshot).toBe("No sugar");
    expect(rows.items[0]?.modifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Oat", priceMinor: 100 }),
      ]),
    );
    const receipt = await owner
      .get(`/api/v1/pos/orders/${order.id}/receipt?format=html`)
      .expect(200);
    expect(receipt.text).toContain("Oat");
    expect(receipt.text).toContain("No sugar");
  });
});
