// Isolated acceptance database. Never resets or deletes the application database.
const { PrismaClient } = require("@prisma/client");
const { spawnSync } = require("node:child_process");
async function main() {
  const database = `cafe_pos_test_${Date.now()}`;
  const admin = new PrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
  await admin.$disconnect();
  const env = { ...process.env, RUN_DATABASE_TESTS: "true" };
  for (const key of [
    "DATABASE_URL",
    "RUNTIME_DATABASE_URL",
    "PLATFORM_DATABASE_URL",
  ]) {
    const url = new URL(env[key]);
    url.pathname = `/${database}`;
    env[key] = url.toString();
  }
  const run = (args) => {
    const result = spawnSync(
      process.platform === "win32" ? "corepack.cmd" : "corepack",
      args,
      { env, stdio: "inherit", shell: process.platform === "win32" },
    );
    if (result.status !== 0)
      throw new Error(`Command failed: ${args.join(" ")}`);
  };
  run(["pnpm", "--filter", "@cafe-pos/contracts", "build"]);
  run(["pnpm", "prisma", "migrate", "deploy"]);
  run(["pnpm", "--filter", "@cafe-pos/api", "test:e2e"]);
  console.log(`Acceptance database retained for inspection: ${database}`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
