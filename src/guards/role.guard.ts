import type { Guard, ExecutionContext } from '@nitrostack/core';

export function RoleGuard(requiredRole: string) {
  class DynamicRoleGuard implements Guard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const role = context.auth?.role as string | undefined;

      if (!role) {
        throw new Error(
          `Access denied: no role claim found on ExecutionContext.auth. ` +
          `Requires "${requiredRole}".`
        );
      }

      if (role !== requiredRole) {
        throw new Error(
          `Access denied: role "${role}" does not satisfy required role "${requiredRole}".`
        );
      }

      return true;
    }
  }

  return DynamicRoleGuard;
}
