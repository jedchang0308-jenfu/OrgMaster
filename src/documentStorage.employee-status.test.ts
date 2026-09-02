import { describe, expect, it } from 'vitest'
import { createOrgDocumentFile, parseOrgDocument } from './documentStorage'
import { screenshotOrganizationState } from './screenshotData'

describe('Employee lifecycle compatibility', () => {
  it('writes an explicit active status for legacy in-memory employees', () => {
    const document = createOrgDocumentFile(screenshotOrganizationState, 'document', '2026-08-31T00:00:00.000Z')
    expect(document.state.employees.length).toBeGreaterThan(0)
    expect(document.state.employees.every((employee) => employee.status === 'active')).toBe(true)
  })

  it('reports implicit-active employees while preserving inactive lifecycle values', () => {
    const document = createOrgDocumentFile(screenshotOrganizationState, 'document', '2026-08-31T00:00:00.000Z')
    const raw = structuredClone(document) as any
    delete raw.state.employees[0].status
    raw.state.employees[1].status = 'inactive'
    const parsed = parseOrgDocument(raw)
    expect(parsed).toMatchObject({ ok: true, compatibility: { implicitActiveEmployeeCount: 1 } })
    if (!parsed.ok) throw new Error(parsed.code)
    expect(parsed.document.state.employees[0].status).toBe('active')
    expect(parsed.document.state.employees[1].status).toBe('inactive')
  })

  it('rejects unknown employee lifecycle values', () => {
    const raw = createOrgDocumentFile(screenshotOrganizationState, 'document') as any
    raw.state.employees[0].status = 'suspended'
    expect(parseOrgDocument(raw)).toMatchObject({ ok: false, code: 'INVALID_DOCUMENT_SHAPE' })
  })
})
