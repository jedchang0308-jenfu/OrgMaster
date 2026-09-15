import type {
  EmployeeNumberAssignmentV1,
  EmployeeNumberParseResult,
  ManagedIdentityRegistryV1,
} from './types'

const EMPLOYEE_NUMBER_PATTERN = /^JFS[0-9]{4}$/u
const MIN_EMPLOYEE_NUMBER = 1
const MAX_EMPLOYEE_NUMBER = 9999

export function parseEmployeeNumber(input: unknown): EmployeeNumberParseResult {
  if (typeof input !== 'string') return { ok: false, code: 'EMPLOYEE_NUMBER_INVALID' }
  const value = input.trim().toUpperCase()
  if (!EMPLOYEE_NUMBER_PATTERN.test(value)) return { ok: false, code: 'EMPLOYEE_NUMBER_INVALID' }
  const serial = Number(value.slice(3))
  if (!Number.isInteger(serial) || serial < MIN_EMPLOYEE_NUMBER || serial > MAX_EMPLOYEE_NUMBER) return { ok: false, code: 'EMPLOYEE_NUMBER_INVALID' }
  return { ok: true, value }
}

export function deriveManagedUsername(employeeNumber: string, domain = 'jenfu.com.tw') {
  const parsed = parseEmployeeNumber(employeeNumber)
  if (!parsed.ok) throw new Error(parsed.code)
  const normalizedDomain = domain.trim().toLowerCase()
  if (!normalizedDomain || normalizedDomain.includes('@') || /\s/u.test(normalizedDomain)) throw new Error('MANAGED_DOMAIN_INVALID')
  return parsed.value.toLowerCase() + '@' + normalizedDomain
}

export function createEmptyManagedIdentityRegistry(): ManagedIdentityRegistryV1 {
  return { revision: 0, assignments: [], tombstones: [] }
}

function cloneRegistry(registry: ManagedIdentityRegistryV1): ManagedIdentityRegistryV1 {
  return {
    revision: registry.revision,
    assignments: registry.assignments.map((entry) => ({ ...entry })),
    tombstones: registry.tombstones.map((entry) => ({ ...entry })),
  }
}

function assertRegistry(registry: ManagedIdentityRegistryV1) {
  if (!Number.isSafeInteger(registry.revision) || registry.revision < 0) throw new Error('MANAGED_IDENTITY_REGISTRY_INVALID')
  const employeeIds = new Set<string>()
  const numbers = new Set<string>()
  for (const assignment of registry.assignments) {
    if (!assignment.employeeId || employeeIds.has(assignment.employeeId)) throw new Error('MANAGED_IDENTITY_REGISTRY_INVALID')
    if (numbers.has(assignment.employeeNumber) || !parseEmployeeNumber(assignment.employeeNumber).ok) throw new Error('MANAGED_IDENTITY_REGISTRY_INVALID')
    employeeIds.add(assignment.employeeId)
    numbers.add(assignment.employeeNumber)
  }
  for (const tombstone of registry.tombstones) {
    if (numbers.has(tombstone.employeeNumber) || !parseEmployeeNumber(tombstone.employeeNumber).ok) throw new Error('MANAGED_IDENTITY_REGISTRY_INVALID')
    numbers.add(tombstone.employeeNumber)
  }
}

export type AssignEmployeeNumberResult =
  | { status: 'applied'; registry: ManagedIdentityRegistryV1; assignment: EmployeeNumberAssignmentV1 }
  | { status: 'noop'; registry: ManagedIdentityRegistryV1; assignment: EmployeeNumberAssignmentV1 }

export function assignEmployeeNumber(
  registry: ManagedIdentityRegistryV1,
  employeeId: string,
  input: unknown,
  actor: string,
  now = new Date().toISOString(),
): AssignEmployeeNumberResult {
  assertRegistry(registry)
  if (!employeeId.trim()) throw new Error('EMPLOYEE_NOT_FOUND')
  const parsed = parseEmployeeNumber(input)
  if (!parsed.ok) throw new Error(parsed.code)
  const value = parsed.value
  const existing = registry.assignments.find((entry) => entry.employeeId === employeeId)
  if (existing?.employeeNumber === value) return { status: 'noop', registry: cloneRegistry(registry), assignment: { ...existing } }
  if (registry.tombstones.some((entry) => entry.employeeNumber === value)) throw new Error('EMPLOYEE_NUMBER_RETIRED')
  const conflicting = registry.assignments.find((entry) => entry.employeeNumber === value && entry.employeeId !== employeeId)
  if (conflicting) throw new Error('EMPLOYEE_NUMBER_CONFLICT')
  const next = cloneRegistry(registry)
  if (existing) {
    next.assignments = next.assignments.filter((entry) => entry.employeeId !== employeeId)
    next.tombstones.push({ employeeNumber: existing.employeeNumber, firstEmployeeId: existing.employeeId, firstAssignedAt: existing.assignedAt, retiredAt: now })
  }
  const assignment: EmployeeNumberAssignmentV1 = { employeeId, employeeNumber: value, revision: next.revision + 1, assignedAt: existing?.assignedAt ?? now, assignedBy: actor }
  next.assignments.push(assignment)
  next.revision += 1
  assertRegistry(next)
  return { status: 'applied', registry: next, assignment: { ...assignment } }
}

export function readEmployeeNumber(registry: ManagedIdentityRegistryV1, employeeId: string) {
  assertRegistry(registry)
  const assignment = registry.assignments.find((entry) => entry.employeeId === employeeId) ?? null
  return assignment ? { ...assignment } : null
}
