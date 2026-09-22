import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async withTenant<T>(organizationId: string, work: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE cafe_pos_app');
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      return work(tx);
    });
  }

  async withPlatform<T>(platformAdminId: string, work: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE cafe_pos_app');
      await tx.$executeRaw`SELECT set_config('app.platform_admin_id', ${platformAdminId}, true)`;
      return work(tx);
    });
  }
}
