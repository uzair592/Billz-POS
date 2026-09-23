import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AppModule } from "../src/app.module";
import { BillingScheduler } from "../src/modules/platform/billing.scheduler";
import { hashPassword } from "../src/common/security";

const run =
  process.env.RUN_DATABASE_TESTS === "true" ? describe : describe.skip;
run("Phase 1 HTTP and database acceptance", () => {
  let app: INestApplication;
  const db = new PrismaClient();
  let admin: ReturnType<typeof request.agent>;
  let csrf: string;
  let owner: ReturnType<typeof request.agent>;
  let ownerCsrf: string;
  let organizationId: string;
  let foreignId: string;
  let planId: string;
  let versionId: string;
  let invoiceId: string;
  const suffix = randomUUID().slice(0, 8);
  const password = "Fixture-Password-2026!";
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    await app.init();
    for (const key of [
      "organization.view",
      "settings.manage",
      "branches.manage",
      "users.manage",
      "roles.manage",
    ])
      await db.permission.upsert({
        where: { key },
        update: {},
        create: { key, name: key, moduleKey: "foundation" },
      });
    await db.platformAdmin.create({
      data: {
        email: `phase1-${suffix}@example.test`,
        name: "Phase 1 test admin",
        passwordHash: await hashPassword(password),
      },
    });
    const plan = await db.subscriptionPlan.create({
      data: {
        code: `test-${suffix}`,
        name: "Test plan",
        maxBranches: 3,
        maxUsers: 10,
        maxDevices: 3,
      },
    });
    planId = plan.id;
    admin = request.agent(app.getHttpServer());
    const login = await admin
      .post("/api/v1/platform/auth/login")
      .send({ email: `phase1-${suffix}@example.test`, password })
      .expect(201);
    csrf = login.body.csrfToken;
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });
  const post = (path: string, body: object) =>
    admin.post(`/api/v1${path}`).set("x-csrf-token", csrf).send(body);

  it("ISO-01 provisions two businesses and activates an owner through mandatory password change", async () => {
    for (const letter of ["a", "b"]) {
      const created = await post("/platform/organizations", {
        name: `TEST Phase1 ${letter} ${suffix}`,
        businessType: "CAFE",
        email: `${letter}-${suffix}@example.test`,
        phone: "03001234567",
        ownerName: "Test Owner",
        ownerUsername: `${letter}-${suffix}`,
        temporaryPassword: password,
        planId,
        moduleIds: [],
      }).expect(201);
      if (letter === "a") organizationId = created.body.id;
      else foreignId = created.body.id;
    }
    owner = request.agent(app.getHttpServer());
    let login = await owner
      .post("/api/v1/auth/login")
      .send({ identifier: `a-${suffix}`, password })
      .expect(201);
    ownerCsrf = login.body.csrfToken;
    await owner.get("/api/v1/organization").expect(403);
    await owner
      .post("/api/v1/auth/change-temporary-password")
      .set("x-csrf-token", ownerCsrf)
      .send({ currentPassword: password, newPassword: password + "New" })
      .expect(201);
    await owner.get("/api/v1/auth/session").expect(401);
    login = await owner
      .post("/api/v1/auth/login")
      .send({ identifier: `a-${suffix}`, password: password + "New" })
      .expect(201);
    ownerCsrf = login.body.csrfToken;
    const own = await owner.get("/api/v1/organization").expect(200);
    expect(own.body.id).toBe(organizationId);
    const billing = await owner
      .get(`/api/v1/billing?organizationId=${foreignId}`)
      .expect(200);
    expect(billing.body.organization.id).toBe(organizationId);
    await owner.get(`/api/v1/platform/billing/${foreignId}`).expect(401);
    await owner
      .post(`/api/v1/platform/billing/${foreignId}/invoices`)
      .set("x-csrf-token", ownerCsrf)
      .send({})
      .expect(401);
  });

  it("SUB-01 records immutable version, partial payment, credit and rejects conflicting retries/overpayment", async () => {
    const version = await post("/platform/billing/plans", {
      planId,
      name: "Test price",
      currency: "PKR",
      monthlyMinor: 100000,
      maxBranches: 3,
      maxUsers: 10,
      maxDevices: 3,
      graceDays: 3,
    }).expect(201);
    versionId = version.body.id;
    const commandId = randomUUID();
    const issued = await post(`/platform/billing/${organizationId}/invoices`, {
      commandId,
      planVersionId: versionId,
    }).expect(201);
    invoiceId = issued.body.id;
    const retry = await post(`/platform/billing/${organizationId}/invoices`, {
      commandId,
      planVersionId: versionId,
    }).expect(201);
    expect(retry.body.id).toBe(invoiceId);
    const entry = {
      commandId: randomUUID(),
      kind: "PAYMENT",
      amountMinor: 40000,
      method: "BANK_TRANSFER",
      reference: "TEST-BANK-REFERENCE",
      reason: "Test partial payment",
    };
    const paid = await post(
      `/platform/billing/${organizationId}/invoices/${invoiceId}/settlements`,
      entry,
    ).expect(201);
    const same = await post(
      `/platform/billing/${organizationId}/invoices/${invoiceId}/settlements`,
      entry,
    ).expect(201);
    expect(same.body.id).toBe(paid.body.id);
    await post(
      `/platform/billing/${organizationId}/invoices/${invoiceId}/settlements`,
      { ...entry, amountMinor: 50000 },
    ).expect(409);
    await post(
      `/platform/billing/${organizationId}/invoices/${invoiceId}/settlements`,
      { ...entry, commandId: randomUUID(), amountMinor: 70000 },
    ).expect(400);
    await post(
      `/platform/billing/${foreignId}/invoices/${invoiceId}/settlements`,
      { ...entry, commandId: randomUUID() },
    ).expect(404);
    await post(
      `/platform/billing/${organizationId}/invoices/${invoiceId}/activate`,
      {},
    ).expect(400);
    await post(
      `/platform/billing/${organizationId}/invoices/${invoiceId}/settlements`,
      {
        ...entry,
        commandId: randomUUID(),
        kind: "CREDIT",
        method: "ADJUSTMENT",
        amountMinor: 10000,
      },
    ).expect(201);
    // Simultaneous retries produce one receipt.
    const final = { ...entry, commandId: randomUUID(), amountMinor: 50000 };
    const [one, two] = await Promise.all([
      post(
        `/platform/billing/${organizationId}/invoices/${invoiceId}/settlements`,
        final,
      ),
      post(
        `/platform/billing/${organizationId}/invoices/${invoiceId}/settlements`,
        final,
      ),
    ]);
    expect(one.status).toBe(201);
    expect(two.status).toBe(201);
    expect(one.body.id).toBe(two.body.id);
    await post(
      `/platform/billing/${organizationId}/invoices/${invoiceId}/activate`,
      {},
    ).expect(201);
    await post("/platform/billing/plans", {
      planId,
      name: "Future price",
      currency: "PKR",
      monthlyMinor: 200000,
      maxBranches: 3,
      maxUsers: 10,
      maxDevices: 3,
      graceDays: 3,
    }).expect(201);
    const summary = await owner.get("/api/v1/billing").expect(200);
    expect(summary.body.invoices[0].totalMinor).toBe(100000);
    expect(summary.body.invoices[0].outstandingMinor).toBe(0);
    expect(summary.body.invoices[0].settlements).toHaveLength(3);
  });

  it("ISO-01 private attachments reject foreign IDs and invalid file types", async () => {
    const body = {
      name: "test-evidence.pdf",
      mimeType: "application/pdf",
      base64: Buffer.from("%PDF-1.4\nTest fixture only").toString("base64"),
    };
    const file = await post(
      `/platform/billing/${organizationId}/invoices/${invoiceId}/attachments`,
      body,
    ).expect(201);
    await owner.get(`/api/v1/billing/attachments/${file.body.id}`).expect(200);
    await post(
      `/platform/billing/${organizationId}/invoices/${invoiceId}/attachments`,
      { ...body, base64: Buffer.from("not a pdf").toString("base64") },
    ).expect(400);
    await admin
      .get(`/api/v1/platform/billing/${foreignId}/attachments/${file.body.id}`)
      .expect(404);
    const other = request.agent(app.getHttpServer());
    const login = await other
      .post("/api/v1/auth/login")
      .send({ identifier: `b-${suffix}`, password })
      .expect(201);
    await other
      .post("/api/v1/auth/change-temporary-password")
      .set("x-csrf-token", login.body.csrfToken)
      .send({ currentPassword: password, newPassword: password + "New" })
      .expect(201);
    await other
      .post("/api/v1/auth/login")
      .send({ identifier: `b-${suffix}`, password: password + "New" })
      .expect(201);
    await other.get(`/api/v1/billing/attachments/${file.body.id}`).expect(404);
  });

  it("SUB-01 restricts a live session, keeps owner billing, and restores same records", async () => {
    await post(`/platform/organizations/${organizationId}/status`, {
      status: "SUSPENDED",
      reason: "Test suspension",
    }).expect(201);
    await owner.get("/api/v1/organization").expect(403);
    await owner.get("/api/v1/billing").expect(200);
    const session = await owner.get("/api/v1/auth/session").expect(200);
    expect(session.body.user.restricted).toBe(true);
    await post(`/platform/organizations/${organizationId}/status`, {
      status: "ACTIVE",
      reason: "Test reactivation",
    }).expect(201);
    const same = await owner.get("/api/v1/organization").expect(200);
    expect(same.body.id).toBe(organizationId);
    await db.organization.update({
      where: { id: organizationId },
      data: {
        status: "SUSPENDED",
        statusExpiresAt: new Date(Date.now() - 1000),
      },
    });
    await owner.get("/api/v1/organization").expect(200);
    const scheduler = app.get(BillingScheduler);
    await scheduler.reconcile();
    await scheduler.reconcile();
    expect(
      await db.auditLog.count({
        where: { organizationId, action: "organization.suspension_expired" },
      }),
    ).toBe(1);
    await db.organizationSubscription.updateMany({
      where: { organizationId, status: "ACTIVE" },
      data: {
        endsAt: new Date(Date.now() - 10000),
        graceEndsAt: new Date(Date.now() - 1),
      },
    });
    await owner.get("/api/v1/organization").expect(403);
    await owner.get("/api/v1/billing").expect(200);
    const restricted = request.agent(app.getHttpServer());
    const login = await restricted
      .post("/api/v1/auth/login")
      .send({ identifier: `a-${suffix}`, password: password + "New" })
      .expect(201);
    expect(login.body.user.restricted).toBe(true);
    await restricted.get("/api/v1/billing").expect(200);
  });

  it("AUTH-35 recovery link is consumed once and revokes active sessions", async () => {
    const issued = await post(
      `/platform/organizations/${organizationId}/recovery-link`,
      { reason: "Test recovery" },
    ).expect(201);
    const token = new URL(issued.body.url).searchParams.get("token");
    const reset = () =>
      request(app.getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({ token, newPassword: password + "Reset" });
    const results = await Promise.all([reset(), reset()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 401]);
    await owner.get("/api/v1/auth/session").expect(401);
  });

  it("ISO-01 runtime credentials deny unscoped reads, guessed IDs and forged platform bypass", async () => {
    const runtime = new PrismaClient({
      datasources: { db: { url: process.env.RUNTIME_DATABASE_URL } },
    });
    try {
      expect(await runtime.organization.findMany()).toEqual([]);
      await runtime.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.organization_id',${organizationId},true)`;
        await tx.$executeRaw`SELECT set_config('app.platform_admin_id',${randomUUID()},true)`;
        expect(
          await tx.organization.findUnique({ where: { id: foreignId } }),
        ).toBeNull();
        expect(
          await tx.billingInvoice.findMany({
            where: { organizationId: foreignId },
          }),
        ).toEqual([]);
      });
      await expect(runtime.platformAdmin.findMany()).rejects.toThrow();
      await expect(
        runtime.$executeRawUnsafe("SET ROLE cafe_pos_platform"),
      ).rejects.toThrow();
      await expect(runtime.billingSettlement.deleteMany()).rejects.toThrow();
    } finally {
      await runtime.$disconnect();
    }
  });
  it("REC-01 invoices and receipts survive an API restart", async () => {
    await app.close();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    await app.init();
    admin = request.agent(app.getHttpServer());
    const login = await admin
      .post("/api/v1/platform/auth/login")
      .send({ email: `phase1-${suffix}@example.test`, password })
      .expect(201);
    csrf = login.body.csrfToken;
    const persisted = await admin
      .get(`/api/v1/platform/billing/${organizationId}`)
      .expect(200);
    expect(persisted.body.invoices[0].id).toBe(invoiceId);
    expect(persisted.body.invoices[0].outstandingMinor).toBe(0);
    expect(persisted.body.invoices[0].settlements).toHaveLength(3);
    const metrics = await admin
      .get("/api/v1/platform/billing/metrics")
      .expect(200);
    expect(metrics.body.currencies.PKR.collectionsMinor).toBe(90000);
    expect(metrics.body.currencies.PKR.creditsMinor).toBe(10000);
  });
});
