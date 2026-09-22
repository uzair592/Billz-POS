import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../../common/auth.decorators';
import type { UserPrincipal } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { PermissionGuard, UserAuthGuard } from '../auth/auth.guards';

@Controller('audit-logs')
@UseGuards(UserAuthGuard, PermissionGuard)
@RequirePermissions('audit.view')
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: UserPrincipal, @Query('cursor') cursor?: string, @Query('take') rawTake?: string, @Query('action') action?: string) {
    const take = Math.min(Math.max(Number(rawTake ?? 25), 1), 100);
    return this.prisma.withTenant(user.organizationId, async (tx) => {
      const rows = await tx.auditLog.findMany({
        where: { organizationId: user.organizationId, action: action ? { startsWith: action } : undefined },
        take: take + 1, skip: cursor ? 1 : 0, cursor: cursor ? { id: cursor } : undefined,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1]?.id : null };
    });
  }
}
