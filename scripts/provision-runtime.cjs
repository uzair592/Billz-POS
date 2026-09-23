// Generates API-only credentials. Run locally with migration authority; no credentials are printed.
const { PrismaClient } = require("@prisma/client");
const { randomBytes } = require("node:crypto");
async function main() {
  const prisma = new PrismaClient();
  try {
    const runtime = randomBytes(32).toString("hex");
    const platform = randomBytes(32).toString("hex");
    await prisma.$executeRawUnsafe(
      `ALTER ROLE cafe_pos_runtime PASSWORD '${runtime}'`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER ROLE cafe_pos_platform PASSWORD '${platform}'`,
    );
    const url = new URL(process.env.DATABASE_URL);
    url.username = "cafe_pos_runtime";
    url.password = runtime;
    const runtimeUrl = url.toString();
    url.username = "cafe_pos_platform";
    url.password = platform;
    // Consumed privately by the setup caller, never commit this output.
    process.stdout.write(
      JSON.stringify({ runtimeUrl, platformUrl: url.toString() }),
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write("Database credential provisioning failed.\n");
  process.exitCode = 1;
});
