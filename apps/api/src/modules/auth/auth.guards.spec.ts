import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './auth.guards';

describe('PermissionGuard', () => {
  it('denies a missing backend permission even if the UI exposes an action', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['users.manage']) } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const context = { getHandler: () => function handler() {}, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ principal: { mustChangePassword: false, permissions: ['organization.view'] } }) }) } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('blocks normal operations while a temporary password is active', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([]) } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const context = { getHandler: () => function listUsers() {}, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ principal: { mustChangePassword: true, permissions: ['users.manage'] } }) }) } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
