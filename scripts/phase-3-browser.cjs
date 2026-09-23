const { chromium, expect } = require("@playwright/test");
const crypto = require("node:crypto");

const base = "http://localhost:3000";
const apiBase = `${base}/api/v1`;
let platformCookie = "";
async function apiCall(path, body, csrf, platform = false) {
  const response = await fetch(`${apiBase}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(platform && platformCookie ? { cookie: platformCookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (platform) {
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) platformCookie = setCookie.split(",")[0].split(";")[0];
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(payload)}`);
  return payload;
}

async function main() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = await apiCall(
    "/platform/auth/login",
    {
      email: process.env.SEED_ADMIN_EMAIL || "admin@example.test",
      password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!",
    },
    undefined,
    true,
  );
  const catalog = await apiCall(
    "/platform/catalog",
    undefined,
    admin.csrfToken,
    true,
  );
  const temporary = `Browser-${suffix}-Temp!`;
  const username = `phase3-playwright-${suffix}`;
  await apiCall(
    "/platform/organizations",
    {
      name: `Phase 3 Playwright Cafe ${suffix}`,
      businessType: "CAFE",
      email: `${username}@example.test`,
      phone: "03001234567",
      ownerName: "Playwright Owner",
      ownerUsername: username,
      temporaryPassword: temporary,
      planId: catalog.plans[0].id,
      initialBranchName: "Main Branch",
      timezone: "Asia/Karachi",
      currencyCode: "PKR",
      graceDays: 0,
      moduleIds: [],
    },
    admin.csrfToken,
    true,
  );
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/login`);
    await page.getByLabel("Username or email").fill(username);
    await page.getByLabel("Password").fill(temporary);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByLabel("Current temporary password").fill(temporary);
    await page.getByLabel("New password").fill(`${temporary}New`);
    await page.getByRole("button", { name: "Change password" }).click();
    await page.getByLabel("Username or email").fill(username);
    await page.getByLabel("Password").fill(`${temporary}New`);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto(`${base}/workspace/menu`);
    await page.getByRole("heading", { name: "Menu management" }).waitFor();
    await page.getByLabel("Category name").fill("Playwright Drinks");
    await page.getByRole("button", { name: "Create category" }).click();
    await page.getByText("Category created.").waitFor();
    await page.getByLabel("Product name").fill("Playwright Latte");
    await page.getByLabel("Branch price (PKR)").fill("10");
    await page.getByLabel("Tax rate (basis points)").fill("1000");
    await page.getByLabel("Modifier name (optional)").fill("Oat milk");
    await page.getByLabel("Modifier price (PKR)").fill("1");
    await page.getByLabel("Variant name (optional)").fill("Large");
    await page.getByLabel("Variant price (PKR)").fill("12");
    await page.getByRole("button", { name: "Create product" }).click();
    await page.getByText("Product created for every active branch.").waitFor();

    let orderId = "";
    page.on("response", async (response) => {
      if (
        response.url().endsWith("/api/v1/pos/orders") &&
        response.request().method() === "POST" &&
        response.ok()
      ) {
        try {
          orderId = (await response.json()).id;
        } catch {}
      }
    });
    await page.goto(`${base}/workspace/pos`);
    await page.getByRole("heading", { name: "Point of sale" }).waitFor();
    const branch = page.locator("select").first();
    await expect(branch.locator("option")).toHaveCount(2);
    await branch.selectOption({ index: 1 });
    await page.getByText("Playwright Latte").waitFor();
    await page.getByRole("button", { name: /Playwright Latte/ }).click();
    await page
      .getByLabel("Playwright Latte variant")
      .selectOption({ index: 1 });
    await page.getByLabel(/Oat milk/).check();
    await page.getByLabel("Opening float (PKR)").fill("10");
    await page.getByRole("button", { name: "Open register" }).click();
    await page.getByText("Open shift selected automatically.").waitFor();
    await page.getByLabel("Card tender (PKR)").fill("0");
    await page.getByRole("button", { name: "Complete sale" }).click();
    await page.getByText(/Sale completed:/).waitFor();
    if (!orderId)
      throw new Error("The visible checkout did not return an order id.");
    await page.goto(`${base}/api/v1/pos/orders/${orderId}/receipt`);
    await page.getByText("Playwright Latte").waitFor();
    const desktopText = await page.locator("body").innerText();
    if (
      /Loading branches…|Loading branches\.\.\.|Application error|Unhandled/i.test(
        desktopText,
      )
    )
      throw new Error("Desktop receipt contains loading/error text");
    await page.screenshot({
      path: "docs/phase-3/screenshots/playwright-desktop-receipt.png",
      fullPage: true,
    });

    for (const [name, viewport] of [
      ["desktop", { width: 1366, height: 768 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`${base}/workspace/pos`);
      await page.getByRole("heading", { name: "Point of sale" }).waitFor();
      const text = await page.locator("body").innerText();
      if (
        !text.trim() ||
        /Loading branches…|Loading branches\.\.\.|Application error|Unhandled/i.test(
          text,
        )
      )
        throw new Error(`${name} POS screen is not ready`);
      await page.screenshot({
        path: `docs/phase-3/screenshots/playwright-${name}-pos.png`,
        fullPage: true,
      });
    }
    console.log(
      "Playwright browser acceptance passed: visible menu, variant/modifier, register, sale, receipt, desktop and mobile.",
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
