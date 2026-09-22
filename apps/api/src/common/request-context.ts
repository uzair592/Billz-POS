import type { Request } from 'express';

export interface UserPrincipal {
  kind: 'user';
  sessionId: string;
  userId: string;
  organizationId: string;
  name: string;
  mustChangePassword: boolean;
  permissions: string[];
  branchIds: string[];
}

export interface PlatformPrincipal {
  kind: 'platform';
  sessionId: string;
  platformAdminId: string;
  name: string;
}

export type AuthenticatedRequest = Request & { principal?: UserPrincipal; platformPrincipal?: PlatformPrincipal };
