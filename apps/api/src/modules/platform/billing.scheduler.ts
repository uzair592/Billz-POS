import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class BillingScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(BillingScheduler.name);
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.reconcile(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      await this.prisma.platform.$transaction(async (tx) => {
        const suspended = await tx.organization.findMany({
          where: { status: "SUSPENDED", statusExpiresAt: { lte: now } },
        });
        for (const organization of suspended) {
          const resumed = await tx.organization.updateMany({
            where: {
              id: organization.id,
              status: "SUSPENDED",
              statusExpiresAt: { lte: now },
            },
            data: { status: "ACTIVE", statusExpiresAt: null },
          });
          if (resumed.count)
            await tx.auditLog.create({
              data: {
                organizationId: organization.id,
                actorType: "SYSTEM",
                action: "organization.suspension_expired",
                entityType: "Organization",
                entityId: organization.id,
                reason: "Scheduled suspension deadline reached",
              },
            });
        }
        const rows = await tx.organizationSubscription.findMany({
          where: {
            status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
            endsAt: { lte: now },
          },
        });
        for (const row of rows) {
          const status =
            (row.graceEndsAt ?? row.endsAt!) <= now ? "EXPIRED" : "PAST_DUE";
          if (row.status === status) continue;
          const changed = await tx.organizationSubscription.updateMany({
            where: { id: row.id, status: row.status },
            data: { status },
          });
          if (changed.count)
            await tx.auditLog.create({
              data: {
                organizationId: row.organizationId,
                actorType: "SYSTEM",
                action: "billing.period_status_reconciled",
                entityType: "OrganizationSubscription",
                entityId: row.id,
                beforeValue: { status: row.status },
                afterValue: { status },
                reason: "Scheduled period and grace deadline check",
              },
            });
        }
      });
    } catch {
      this.logger.error(
        "Subscription reconciliation failed; request-time entitlement checks remain enforced.",
      );
    } finally {
      this.running = false;
    }
  }
}
