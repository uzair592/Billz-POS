import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../common/request-context';
import { REQUIRED_PERMISSIONS } from '../../common/auth.decorators';
import { safeEqual, sha256 } from '../../common/security';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.config.get<string>('SESSION_COOKIE_NAME', 'cafe_pos_session');
    const rawToken = request.cookies?.[cookieName] as string | undefined;
    if (!rawToken) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Please sign in.' });

    const session = await this.prisma.session.findFirst({
      where: { tokenHash: sha256(rawToken), revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true, organizationId: true, csrfHash: true },
    });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Your session has expired.' });

    const user = await this.prisma.withTenant(session.organizationId, (tx) =>
      tx.user.findFirst({
        where: { id: session.userId, organizationId: session.organizationId, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
        select: {
          id: true, name: true, mustChangePassword: true,
          branchMemberships: { select: { branchId: true } },
          roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } },
        },
      }),
    );
    if (!user) throw new UnauthorizedException({ code: 'ACCOUNT_UNAVAILABLE', message: 'This account is unavailable.' });

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const csrf = request.get('x-csrf-token');
      if (!csrf || !safeEqual(session.csrfHash, sha256(csrf))) {
        throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'The security token is invalid.' });
      }
    }

    request.principal = {
      kind: 'user', sessionId: session.id, userId: user.id, organizationId: session.organizationId,
      name: user.name, mustChangePassword: user.mustChangePassword,
      permissions: [...new Set(user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))],
      branchIds: user.branchMemberships.map(({ branchId }) => branchId),
    };
    return true;
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? [];
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw new UnauthorizedException();
    if (principal.mustChangePassword && !context.getHandler().name.includes('changePassword')) {
      throw new ForbiddenException({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password first.' });
    }
    if (required.some((permission) => !principal.permissions.includes(permission))) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'You do not have permission for this action.' });
    }
    return true;
  }
}

@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = request.cookies?.[`${this.config.get<string>('SESSION_COOKIE_NAME', 'cafe_pos_session')}_platform`] as string | undefined;
    if (!rawToken) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Please sign in.' });
    const session = await this.prisma.platformSession.findFirst({
      where: { tokenHash: sha256(rawToken), revokedAt: null, expiresAt: { gt: new Date() }, platformAdmin: { isActive: true } },
      select: { id: true, csrfHash: true, platformAdmin: { select: { id: true, name: true } } },
    });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Your session has expired.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const csrf = request.get('x-csrf-token');
      if (!csrf || !safeEqual(session.csrfHash, sha256(csrf))) {
        throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'The security token is invalid.' });
      }
    }
    request.platformPrincipal = { kind: 'platform', sessionId: session.id, platformAdminId: session.platformAdmin.id, name: session.platformAdmin.name };
    return true;
  }
}
