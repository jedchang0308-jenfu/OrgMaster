import type { Role } from './types'

export interface PositionRoleInput {
  roleId: string
  role?: Role
}

/**
 * Keep Role pairing authoritative while making position creation safe:
 * reuse an existing Role with the same normalized name, otherwise let the
 * caller provide a newly generated Role ID for an atomic command.
 */
export function resolvePositionRole(
  roles: Role[],
  title: string,
  createId: () => string,
): PositionRoleInput {
  const name = title.trim() || '未命名職位'
  const existing = roles.find((role) => role.name.trim() === name)
  if (existing) return { roleId: existing.id }
  const role: Role = { id: createId(), name }
  return { roleId: role.id, role }
}
