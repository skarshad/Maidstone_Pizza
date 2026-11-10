export const ROLES = ['customer', 'kitchen', 'manager', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { customer: 0, kitchen: 1, manager: 2, admin: 3 };

/** True when `role` is at least as privileged as `minimum`. */
export function hasRole(role: Role | null | undefined, minimum: Role): boolean {
  return role != null && RANK[role] >= RANK[minimum];
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
