import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const permissions = [
  ["organization.view", "View organization", "foundation"],
  ["branches.manage", "Manage branches", "foundation"],
  ["users.manage", "Manage employees", "foundation"],
  ["roles.manage", "Manage roles and permissions", "foundation"],
  ["settings.manage", "Manage settings", "foundation"],
  ["audit.view", "View audit logs", "foundation"],
  ["discounts.apply", "Apply discounts", "pos"],
  ["refunds.create", "Create refunds", "pos"],
  ["voids.create", "Void orders", "pos"],
  ["prices.change", "Change selling prices", "products"],
  ["costs.view", "View cost prices", "products"],
  ["profit.view", "View profit", "reports"],
  ["products.manage", "Manage products", "products"],
  ["stock.manage", "Manage stock", "inventory"],
  ["purchases.manage", "Manage purchases", "purchases"],
  ["expenses.manage", "Manage expenses", "expenses"],
  ["reports.view", "View reports", "reports"],
  ["pos.catalog.view", "View POS catalog", "pos"],
  ["pos.catalog.manage", "Manage POS catalog", "pos"],
  ["pos.register.open", "Open and close registers", "registers"],
  ["pos.sale.create", "Create POS sales", "pos"],
  ["pos.sale.refund", "Refund POS sales", "pos"],
  ["pos.sale.void", "Void POS sales", "pos"],
  ["pos.sale.history", "View POS history", "pos"],
  ["pos.sale.reprint", "Reprint POS receipts", "pos"],
] as const;

const modules = [
  ["foundation", "Foundation", 1],
  ["pos", "Point of sale", 2],
  ["orders", "Orders", 2],
  ["tables", "Tables", 3],
  ["kds", "Kitchen display", 3],
  ["products", "Products", 2],
  ["inventory", "Inventory", 4],
  ["purchases", "Purchases", 4],
  ["customers", "Customers and credit", 5],
  ["expenses", "Expenses", 5],
  ["registers", "Cash registers", 5],
  ["reports", "Reports", 6],
] as const;

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seeds are disabled in production.");
  for (const [key, name, phase] of modules) {
    await prisma.module.upsert({
      where: { key },
      update: { name, phase },
      create: { key, name, phase },
    });
  }
  for (const [key, name, moduleKey] of permissions) {
    await prisma.permission.upsert({
      where: { key },
      update: { name, moduleKey },
      create: { key, name, moduleKey },
    });
  }

  const foundation = await prisma.module.findUniqueOrThrow({
    where: { key: "foundation" },
  });
  const planDefinitions = [
    {
      code: "starter",
      name: "Starter",
      maxBranches: 1,
      maxUsers: 5,
      maxDevices: 3,
    },
    {
      code: "growth",
      name: "Growth",
      maxBranches: 3,
      maxUsers: 20,
      maxDevices: 5,
    },
    { code: "pro", name: "Pro", maxBranches: 10, maxUsers: 75, maxDevices: 10 },
    {
      code: "demo-one-device",
      name: "Demo: 1 device (unpriced)",
      maxBranches: 1,
      maxUsers: 5,
      maxDevices: 1,
    },
    {
      code: "demo-two-devices",
      name: "Demo: 2 devices (unpriced)",
      maxBranches: 1,
      maxUsers: 5,
      maxDevices: 2,
    },
    {
      code: "demo-three-devices",
      name: "Demo: 3 devices (unpriced)",
      maxBranches: 1,
      maxUsers: 5,
      maxDevices: 3,
    },
  ];
  for (const definition of planDefinitions) {
    const plan = await prisma.subscriptionPlan.upsert({
      where: { code: definition.code },
      update: {},
      create: definition,
    });
    await prisma.planModule.upsert({
      where: { planId_moduleId: { planId: plan.id, moduleId: foundation.id } },
      update: {},
      create: { planId: plan.id, moduleId: foundation.id },
    });
  }

  const email = (
    process.env.SEED_ADMIN_EMAIL ?? "admin@example.test"
  ).toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 12 characters.");
  await prisma.platformAdmin.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Platform Administrator",
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      mustChangePassword: true,
    },
  });
}

main().finally(() => prisma.$disconnect());
