import { PrismaClient } from "@prisma/client";

const run =
  process.env.RUN_DATABASE_TESTS === "true" ? describe : describe.skip;
run("PostgreSQL tenant isolation", () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  it("does not return another organization branch after tenant context is set", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const [a, b] = await Promise.all([
      prisma.organization.create({
        data: { name: `A ${suffix}`, slug: `a-${suffix}` },
      }),
      prisma.organization.create({
        data: { name: `B ${suffix}`, slug: `b-${suffix}` },
      }),
    ]);
    const foreign = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE cafe_pos_app");
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${b.id}, true)`;
      return tx.branch.create({
        data: { organizationId: b.id, name: "Foreign", code: "FOREIGN" },
      });
    });
    const visible = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE cafe_pos_app");
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${a.id}, true)`;
      return tx.branch.findUnique({ where: { id: foreign.id } });
    });
    expect(visible).toBeNull();
    await prisma.branch.delete({ where: { id: foreign.id } });
    await prisma.organization.deleteMany({
      where: { id: { in: [a.id, b.id] } },
    });
  });

  it("does not expose another organization registered device", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const [a, b] = await Promise.all([
      prisma.organization.create({
        data: { name: `Device A ${suffix}`, slug: `device-a-${suffix}` },
      }),
      prisma.organization.create({
        data: { name: `Device B ${suffix}`, slug: `device-b-${suffix}` },
      }),
    ]);
    const foreign = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE cafe_pos_app");
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${b.id}, true)`;
      return tx.organizationDevice.create({
        data: {
          organizationId: b.id,
          deviceHash: `hash-${suffix}`,
          displayName: "Foreign phone",
        },
      });
    });
    const visible = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE cafe_pos_app");
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${a.id}, true)`;
      return tx.organizationDevice.findUnique({ where: { id: foreign.id } });
    });
    expect(visible).toBeNull();
    await prisma.organizationDevice.delete({ where: { id: foreign.id } });
    await prisma.organization.deleteMany({
      where: { id: { in: [a.id, b.id] } },
    });
  });
});
