import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";

export type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  readonly platform: PrismaClient;
  constructor(config: ConfigService) {
    super({
      datasources: {
        db: { url: config.getOrThrow<string>("RUNTIME_DATABASE_URL") },
      },
    });
    this.platform = new PrismaClient({
      datasources: {
        db: { url: config.getOrThrow<string>("PLATFORM_DATABASE_URL") },
      },
    });
  }
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.platform.$connect();
    for (const client of [this, this.platform]) {
      const rows = await client.$queryRaw<
        { unsafe: boolean }[]
      >`SELECT (rolsuper OR rolbypassrls OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid)) AS unsafe FROM pg_roles r WHERE rolname=current_user`;
      if (!rows[0] || rows[0].unsafe)
        throw new Error(
          "API database credentials must not own tables or bypass row-level security.",
        );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.platform.$disconnect();
  }

  async withTenant<T>(
    organizationId: string,
    work: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      return work(tx);
    });
  }

  async withPlatform<T>(
    platformAdminId: string,
    work: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.platform.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_admin_id', ${platformAdminId}, true)`;
      return work(tx);
    });
  }

  async identity(identifier: string) {
    const rows = await this.$queryRaw<
      { id: string; organization_id: string }[]
    >`SELECT * FROM auth_identity(${identifier})`;
    return rows[0];
  }
  async sessionByToken(hash: string) {
    const rows = await this.$queryRaw<
      {
        id: string;
        user_id: string;
        organization_id: string;
        csrf_hash: string;
      }[]
    >`SELECT * FROM auth_session(${hash})`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          organizationId: row.organization_id,
          csrfHash: row.csrf_hash,
        }
      : null;
  }
  async resetByToken(hash: string) {
    const rows = await this.$queryRaw<
      { id: string; user_id: string; organization_id: string }[]
    >`SELECT * FROM auth_reset(${hash})`;
    const row = rows[0];
    return row
      ? { id: row.id, userId: row.user_id, organizationId: row.organization_id }
      : null;
  }
}
