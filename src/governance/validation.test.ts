import { describe, expect, it } from 'vitest'
import { validateDocument } from './validation'
import { createSeedDocument } from '../../server/orgmasterGovernanceStore'
describe('governance validation diagnostics', () => { it('accepts the V1 seed document', () => { const issues = validateDocument(createSeedDocument()); expect(issues, JSON.stringify(issues)).toEqual([]) }) })
