import { Injectable } from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../../database/prisma.service';

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

  create(event: AuditEvent, tx: TransactionClient | PrismaService = this.prisma) {
    return tx.auditLog.create({ data: event });
  }
}
