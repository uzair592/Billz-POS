import { Injectable } from "@nestjs/common";
import { AuditActorType, Prisma } from "@prisma/client";
import {
  PrismaService,
  TransactionClient,
} from "../../database/prisma.service";

export interface AuditEvent {
  organizationId?: string;
  branchId?: string;
  userId?: string;
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeValue?: Prisma.InputJsonValue;
  afterValue?: Prisma.InputJsonValue;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  create(event: AuditEvent, tx?: TransactionClient | PrismaService) {
    if (tx) return tx.auditLog.create({ data: event });
    if (event.actorType === "PLATFORM_ADMIN" && event.actorId)
      return this.prisma.withPlatform(event.actorId, (client) =>
        client.auditLog.create({ data: event }),
      );
    if (event.organizationId)
      return this.prisma.withTenant(event.organizationId, (client) =>
        client.auditLog.create({ data: event }),
      );
    throw new Error("Audit events require an explicit authorized transaction.");
  }
}
