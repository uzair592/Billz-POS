const { chromium, expect } = require("@playwright/test");
const { PrismaClient } = require("@prisma/client");
const crypto = require("node:crypto");
const fs = require("node:fs");

const base = "http://localhost:3000";
const apiBase = `${base}/api/v1`;
let platformCookie = "";
let platformCsrf = "";

async function platformApi(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(platformCookie ? { cookie: platformCookie } : {}),
      ...(platformCsrf ? { "x-csrf-token": platformCsrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const cookies =
    response.headers.getSetCookie?.() ?? [];
  if (cookies.length)
    platformCookie = cookies.map((cookie) => cookie.split(";")[0]).join("; ");
  const payload = await response.json();
  if (payload?.csrfToken) platformCsrf = payload.csrfToken;
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(payload)}`);
  return payload;
}

async function tenantApi(page, path, body, idempotencyKey) {
  return page.evaluate(
    async ({ path, body, idempotencyKey }) => {
      const response = await fetch(`/api/v1${path}`, {
        method: body ? "POST" : "GET",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(sessionStorage.getItem("csrf")
            ? { "x-csrf-token": sessionStorage.getItem("csrf") }
            : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(`${path}: ${JSON.stringify(payload)}`);
      return payload;
    },
    { path, body, idempotencyKey },
  );
}

async function shoot(page, path, options = {}) {
  for (const attempt of [1, 2]) {
    try {
      await page.screenshot({
        path,
        timeout: 20_000,
        animations: "disabled",
        ...options,
      });
      return;
    } catch (error) {
      if (attempt === 2)
        console.warn(
          `Screenshot skipped (${path}): ${error.message.split("\n")[0]}`,
        );
      else await page.waitForTimeout(500);
    }
  }
}

async function signIn(browser, username, temporaryPassword, viewport) {
  const context = await browser.newContext({ viewport });
  context.setDefaultNavigationTimeout(120_000);
  context.setDefaultTimeout(60_000);
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password").fill(temporaryPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(change-password|workspace)/);
  if (page.url().includes("change-password")) {
    const permanent = `${temporaryPassword}New`;
    await page.getByLabel("Current temporary password").fill(temporaryPassword);
    await page.getByLabel("New password").fill(permanent);
    await page.getByRole("button", { name: "Change password" }).click();
    await page.waitForURL(/\/login/);
    await page.getByLabel("Username or email").fill(username);
    await page.getByLabel("Password").fill(permanent);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/workspace/);
  }
  return { context, page };
}

async function main() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(`${apiBase}/health`)).ok) break;
    } catch {}
    if (attempt === 119) throw new Error("Application health check timed out.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = await platformApi("/platform/auth/login", {
    email: process.env.SEED_ADMIN_EMAIL || "admin@example.test",
    password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!",
  });
  const catalog = await platformApi("/platform/catalog");
  const plan =
    catalog.plans.find((candidate) => candidate.maxDevices >= 5) ??
    catalog.plans.at(-1);
  const ownerTemporary = `P4Owner-${suffix}!`;
  const ownerUsername = `p4-browser-owner-${suffix}`;
  const organization = await platformApi("/platform/organizations", {
    name: `Phase 4 Browser Restaurant ${suffix}`,
    businessType: "RESTAURANT",
    email: `${ownerUsername}@example.test`,
    phone: "03001234567",
    ownerName: "Phase 4 Browser Owner",
    ownerUsername,
    temporaryPassword: ownerTemporary,
    planId: plan.id,
    initialBranchName: "Main Branch",
    timezone: "Asia/Karachi",
    currencyCode: "PKR",
    graceDays: 0,
    moduleIds: [],
  });

  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  fs.mkdirSync("docs/phase-4/screenshots", { recursive: true });
  const contexts = [];
  const db = new PrismaClient();
  try {
    const owner = await signIn(browser, ownerUsername, ownerTemporary, {
      width: 1366,
      height: 768,
    });
    contexts.push(owner.context);

    await owner.page.goto(`${base}/workspace/menu`);
    await owner.page
      .getByRole("heading", { name: "Menu management" })
      .waitFor();
    await owner.page.getByLabel("Category name").fill("Browser mains");
    await owner.page.getByRole("button", { name: "Create category" }).click();
    await owner.page.getByText("Category created.").waitFor();
    await owner.page.getByLabel("Product name").fill("Browser biryani");
    await owner.page.getByLabel("Branch price (PKR)").fill("10");
    await owner.page.getByLabel("Tax rate (basis points)").fill("0");
    await owner.page.getByLabel("Modifier name (optional)").fill("Extra raita");
    await owner.page.getByLabel("Modifier price (PKR)").fill("1");
    await owner.page.getByRole("button", { name: "Create product" }).click();
    await owner.page
      .getByText("Product created for every active branch.")
      .waitFor();

    await owner.page.goto(`${base}/workspace/service-setup`);
    await owner.page
      .getByRole("heading", { name: "Table and kitchen setup" })
      .waitFor();
    await owner.page.getByLabel("Table name").fill(`Browser T-${suffix}`);
    await owner.page.getByLabel("Capacity").fill("4");
    await owner.page.getByRole("button", { name: "Create table" }).click();
    await owner.page.reload();
    await expect(
      owner.page.getByText(`Browser T-${suffix} · seats 4`),
    ).toBeVisible();
    await owner.page.getByLabel("Station name").fill(`Browser Hot-${suffix}`);
    await owner.page.getByRole("button", { name: "Create station" }).click();
    await owner.page.reload();
    await expect(
      owner.page.getByText(`Browser Hot-${suffix}`),
    ).toBeVisible();

    const [branches, roles] = await Promise.all([
      tenantApi(owner.page, "/branches"),
      tenantApi(owner.page, "/roles"),
    ]);
    const branchId = branches[0].id;
    const staffTemporary = `P4Staff-${suffix}!`;
    const staff = [
      ["waiter", `p4-waiter-${suffix}`, "Browser Waiter"],
      ["kitchen_staff", `p4-kitchen-${suffix}`, "Browser Kitchen"],
      ["cashier", `p4-cashier-${suffix}`, "Browser Cashier"],
    ];
    for (const [roleKey, username, name] of staff) {
      const role = roles.find((candidate) => candidate.key === roleKey);
      if (!role) throw new Error(`Default ${roleKey} role was not found.`);
      await tenantApi(owner.page, "/users", {
        name,
        username,
        temporaryPassword: staffTemporary,
        roleIds: [role.id],
        branchIds: [branchId],
      });
    }

    await owner.page.goto(`${base}/workspace/pos`);
    await owner.page.getByRole("heading", { name: "Point of sale" }).waitFor();
    await owner.page.getByLabel("Branch").selectOption(branchId);
    await owner.page.getByLabel("Opening float (PKR)").fill("100");
    await owner.page.getByRole("button", { name: "Open register" }).click();
    await owner.page.getByText("Open shift selected automatically.").waitFor();

    const waiter = await signIn(
      browser,
      `p4-waiter-${suffix}`,
      staffTemporary,
      { width: 390, height: 844 },
    );
    const kitchen = await signIn(
      browser,
      `p4-kitchen-${suffix}`,
      staffTemporary,
      { width: 1024, height: 768 },
    );
    const cashier = await signIn(
      browser,
      `p4-cashier-${suffix}`,
      staffTemporary,
      { width: 1366, height: 768 },
    );
    contexts.push(waiter.context, kitchen.context, cashier.context);

    let orderId = "";
    waiter.page.on("response", async (response) => {
      if (
        response.url().includes("/api/v1/phase4/dine-in/orders") &&
        response.request().method() === "POST" &&
        response.ok()
      ) {
        try {
          const payload = await response.json();
          if (payload.order?.id) orderId = payload.order.id;
        } catch {}
      }
    });
    await waiter.page.goto(`${base}/workspace/dine-in`);
    await waiter.page
      .getByRole("heading", { name: "Dine-in waiter" })
      .waitFor();
    await waiter.page
      .getByLabel("Table", { exact: true })
      .selectOption({ label: `Browser T-${suffix}` });
    await waiter.page
      .getByLabel("Kitchen station")
      .selectOption({ label: `Browser Hot-${suffix}` });
    await waiter.page
      .getByLabel("Menu item")
      .selectOption({ label: "Browser biryani" });
    await waiter.page.getByLabel(/Extra raita/).check();
    await waiter.page.getByLabel("Kitchen notes").fill("No chilli");
    await expect(
      waiter.page.getByRole("button", { name: "Send dine-in order" }),
    ).toBeVisible();
    await shoot(waiter.page, "docs/phase-4/screenshots/mobile-waiter-order.png", { fullPage: true });
    await waiter.page
      .getByRole("button", { name: "Send dine-in order" })
      .click();
    await waiter.page.getByText(/Order .* sent to kitchen/).waitFor();
    if (!orderId)
      throw new Error("Waiter workflow did not return an order ID.");

    await kitchen.page.goto(`${base}/workspace/kitchen`);
    await kitchen.page
      .getByRole("heading", { name: "Kitchen station" })
      .waitFor();
    await kitchen.page
      .getByText("Browser biryani")
      .waitFor({ timeout: 15_000 });
    await expect(kitchen.page.getByText("Note: No chilli")).toBeVisible();
    await expect(kitchen.page.getByText(/Extra raita/)).toBeVisible();
    await shoot(kitchen.page, "docs/phase-4/screenshots/tablet-kitchen-initial.png", { fullPage: true });
    await kitchen.page.getByRole("button", { name: "Mark ready" }).click();
    await kitchen.page.getByText("Ticket marked ready").waitFor();

    await waiter.page.reload();
    await waiter.page.getByLabel("Continue open order").selectOption(orderId);
    await waiter.page.getByLabel("Kitchen notes").fill("Delta: one more plate");
    await waiter.page
      .getByRole("button", { name: "Send delta ticket" })
      .click();
    await waiter.page.getByText(/Delta .* sent to kitchen/).waitFor();
    await kitchen.page
      .getByText("Note: Delta: one more plate")
      .waitFor({ timeout: 15_000 });
    await shoot(kitchen.page, "docs/phase-4/screenshots/tablet-kitchen-delta.png", { fullPage: true });
    await kitchen.page.getByRole("button", { name: "Mark ready" }).click();
    await kitchen.page.getByText("Ticket marked ready").waitFor();

    await cashier.page.goto(`${base}/workspace/dine-in/cashier`);
    await cashier.page
      .getByRole("heading", { name: "Dine-in cashier" })
      .waitFor();
    await cashier.page.getByLabel("Open order").selectOption(orderId);
    await expect(cashier.page.getByText("Remaining: PKR 21.00")).toBeVisible();
    await expect(cashier.page.getByLabel("Tender amount in PKR")).toHaveValue(
      "21.00",
    );
    await shoot(cashier.page, "docs/phase-4/screenshots/desktop-cashier-payment.png", { fullPage: true });
    await cashier.page.getByRole("button", { name: "Settle order" }).click();
    await cashier.page.getByText(/Settled .* receipt ready/).waitFor();
    const popupPromise = cashier.context.waitForEvent("page");
    await cashier.page.getByRole("link", { name: "Open receipt" }).click();
    const receipt = await popupPromise;
    await receipt.waitForLoadState("domcontentloaded");
    const receiptText = await receipt.locator("body").innerText();
    expect(receiptText).toContain("Browser biryani");
    expect(receiptText).toContain("Extra raita");
    expect(receiptText).toContain("No chilli");
    expect(receiptText).toContain("Tender CASH");
    await receipt.screenshot({
      path: "docs/phase-4/screenshots/desktop-receipt-reprint.png",
      fullPage: true,
    });

    const saved = await db.posOrder.findFirstOrThrow({
      where: { id: orderId, organizationId: organization.id },
      include: { items: true, tickets: true, payments: true, receipt: true },
    });
    if (saved.items.length !== 2 || saved.tickets.length !== 2)
      throw new Error(
        "Persisted order does not contain one initial and one delta item.",
      );
    if (saved.tickets.some((ticket) => ticket.status !== "READY"))
      throw new Error("Persisted kitchen tickets are not ready.");
    if (saved.payments.length !== 1 || saved.payments[0].amountMinor !== 2100)
      throw new Error(
        "Persisted PKR tender did not cross the minor-unit boundary once.",
      );
    if (!saved.receipt || saved.status !== "PAID")
      throw new Error("Persisted settlement or receipt is missing.");
    const tables = await tenantApi(
      owner.page,
      `/phase4/tables?branchId=${branchId}`,
    );
    const table = tables.find(
      (candidate) => candidate.name === `Browser T-${suffix}`,
    );
    if (table?.status !== "AVAILABLE")
      throw new Error("The settled table was not released.");

    const stations = await tenantApi(
      owner.page,
      `/phase4/stations?branchId=${branchId}`,
    );
    const station = stations.find(
      (candidate) => candidate.name === `Browser Hot-${suffix}`,
    );
    if (!station) throw new Error("Kitchen station was not found.");
    const products = await tenantApi(
      owner.page,
      `/pos/catalog?branchId=${branchId}`,
    );
    const menuProduct = products.find(
      (candidate) => candidate.name === "Browser biryani",
    );
    if (!menuProduct) throw new Error("Browser biryani was not found.");
    const splitTable = await tenantApi(owner.page, "/phase4/tables", {
      branchId,
      name: `Browser S-${suffix}`,
      capacity: 4,
    });
    const openOrder = async (quantity) => {
      const created = await tenantApi(
        owner.page,
        "/phase4/dine-in/orders",
        {
          branchId,
          tableId: splitTable.id,
          stationId: station.id,
          items: [{ productId: menuProduct.id, quantity, modifiers: [] }],
        },
        crypto.randomUUID(),
      );
      return created.order;
    };

    const depositOrder = await openOrder(1);
    await owner.page.goto(`${base}/workspace/bookings`);
    await owner.page
      .getByRole("heading", { name: "Reservations and service bookings" })
      .waitFor();
    await owner.page.getByLabel("Customer name").fill("Browser Deposit Guest");
    await owner.page.getByLabel("Party size").fill("2");
    await owner.page.getByLabel("Requested deposit (PKR)").fill("5");
    await owner.page
      .getByLabel("Starts")
      .fill(new Date(Date.now() + 3_600_000).toISOString().slice(0, 16));
    await owner.page
      .getByLabel("Ends")
      .fill(new Date(Date.now() + 7_200_000).toISOString().slice(0, 16));
    await owner.page.getByLabel("Table").selectOption(splitTable.id);
    await owner.page.getByRole("button", { name: "Create booking" }).click();
    const requestedRow = owner.page
      .getByText(/Requested PKR 5.00 · Collected PKR 0.00/)
      .first();
    await requestedRow.waitFor();
    await requestedRow.click();
    await shoot(owner.page, "docs/phase-4/screenshots/desktop-booking-deposit-requested.png");
    await owner.page.getByLabel("Amount (PKR)").fill("5");
    await owner.page.getByRole("button", { name: "Record collection" }).click();
    const collectedRow = owner.page
      .getByText(/Requested PKR 5.00 · Collected PKR 5.00/)
      .first();
    await collectedRow.waitFor();
    await collectedRow.click();
    await shoot(owner.page, "docs/phase-4/screenshots/desktop-booking-deposit-collected.png");
    await owner.page.getByLabel("Eligible dine-in order").selectOption(depositOrder.id);
    await owner.page
      .getByRole("button", { name: "Apply collected deposit to order" })
      .click();
    const appliedRow = owner.page
      .getByText(/Collected PKR 5.00 · Refunded PKR 0.00 · Applied PKR 5.00/)
      .first();
    await appliedRow.waitFor();
    await appliedRow.click();
    await shoot(owner.page, "docs/phase-4/screenshots/desktop-booking-deposit-applied.png");
    await owner.page.getByRole("button", { name: "Cancel booking" }).click();
    await owner.page
      .getByRole("alert")
      .waitFor({ timeout: 10_000 });

    await cashier.page.goto(`${base}/workspace/dine-in/cashier`);
    await cashier.page.getByLabel("Open order").selectOption(depositOrder.id);
    await expect(cashier.page.getByText("Remaining: PKR 5.00")).toBeVisible();
    await shoot(cashier.page, "docs/phase-4/screenshots/desktop-cashier-after-deposit.png");
    await cashier.page.getByRole("button", { name: "Settle order" }).click();
    await cashier.page.getByText(/Settled .* receipt ready/).waitFor();
    const depositSaved = await db.posOrder.findUniqueOrThrow({
      where: { id: depositOrder.id },
      include: { payments: true, receipt: true, table: true },
    });
    if (depositSaved.paidMinor !== depositOrder.totalMinor)
      throw new Error("Deposit order was not fully settled.");
    if (depositSaved.payments.length !== 2)
      throw new Error(
        "Deposit order should hold one DEPOSIT and one CASH payment.",
      );
    if (depositSaved.payments[0].method !== "DEPOSIT")
      throw new Error("Deposit payment was not recorded as a DEPOSIT tender.");
    if (depositSaved.payments[1].amountMinor !== 500)
      throw new Error("Cash settlement did not equal the reduced balance.");
    if (!depositSaved.receipt || depositSaved.table?.status !== "AVAILABLE")
      throw new Error("Deposit settlement did not receipt or release the table.");

    const splitOrder = await openOrder(2);
    await cashier.page.reload();
    await cashier.page.getByLabel("Open order").selectOption(splitOrder.id);
    await cashier.page
      .getByLabel("Split into shares (comma separated labels)")
      .fill("A, B");
    const splitResponse = cashier.page.waitForResponse(
      (response) =>
        response.url().includes("/split") &&
        response.request().method() === "POST",
    );
    await cashier.page.getByRole("button", { name: "Split bill evenly" }).click();
    const splitReply = await splitResponse;
    if (!splitReply.ok())
      throw new Error(
        `Split failed with ${splitReply.status()}: ${await splitReply.text()}`,
      );
    await cashier.page.getByText(/Bill split into shares/).waitFor();
    await expect(cashier.page.getByText(/A OPEN PKR 10.00/)).toBeVisible();
    await expect(cashier.page.getByText(/B OPEN PKR 10.00/)).toBeVisible();
    await shoot(cashier.page, "docs/phase-4/screenshots/desktop-cashier-split.png");
    const shareSelect = cashier.page.getByLabel("Open share");
    const shareLabels = await shareSelect.locator("option").allInnerTexts();
    const shareLabel = (name) =>
      shareLabels.find((label) => label.trim().startsWith(`${name} ·`));
    await shareSelect.selectOption({ label: shareLabel("A") });
    await cashier.page
      .getByRole("button", { name: "Settle selected share" })
      .click();
    await cashier.page.getByText(/Share A settled/).waitFor();
    await shareSelect.selectOption({ label: shareLabel("B") });
    await cashier.page
      .getByRole("button", { name: "Settle selected share" })
      .click();
    await cashier.page.getByText(/Share B settled/).waitFor();
    await shoot(cashier.page, "docs/phase-4/screenshots/desktop-cashier-split-settled.png");
    const splitSaved = await db.posOrder.findUniqueOrThrow({
      where: { id: splitOrder.id },
      include: { shares: true, payments: true, receipt: true, table: true },
    });
    if (splitSaved.shares.length !== 2)
      throw new Error("The bill was not split into two shares.");
    if (splitSaved.shares.some((share) => share.status !== "SETTLED"))
      throw new Error("Every split share must settle.");
    if (splitSaved.payments.filter((payment) => payment.shareId).length !== 2)
      throw new Error("Each share must record its own payment.");
    if (splitSaved.paidMinor !== splitOrder.totalMinor)
      throw new Error("Split settlement did not equal the order total.");
    if (!splitSaved.receipt || splitSaved.status !== "PAID")
      throw new Error("Split bill did not close the order with a receipt.");
    if (splitSaved.table?.status !== "AVAILABLE")
      throw new Error("Split bill did not release the table.");

    console.log(
      "Phase 4 browser acceptance passed: separate waiter, kitchen, and cashier sessions; modifiers, notes, delta tickets, PKR checkout, receipt reprint, persisted rows, table release, requested-versus-collected deposits, deposit application, and split-bill share settlement.",
    );
  } finally {
    await db.$disconnect();
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
