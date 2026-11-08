import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ADMINISTRATION_BATCH_COMMAND_CONTRACT, ADMINISTRATION_COMMAND_CONTRACT, ADMINISTRATIVE_APPLICATION_IDS } from './administrationContract'

describe('administration browser boundary', () => {
  it('keeps browser-visible command metadata free of Node runtime imports', () => {
    const contract = fs.readFileSync(new URL('./administrationContract.ts', import.meta.url), 'utf8')
    const component = fs.readFileSync(new URL('../components/GovernanceAdministrators.tsx', import.meta.url), 'utf8')
    expect(contract).not.toMatch(/node:/u)
    expect(component).toContain("from '../governance/administrationContract'")
    expect(ADMINISTRATION_COMMAND_CONTRACT).toBe('orgmaster.administration-command.v1')
    expect(ADMINISTRATION_BATCH_COMMAND_CONTRACT).toBe('orgmaster.administration-batch-command.v2')
    expect(ADMINISTRATIVE_APPLICATION_IDS).toEqual(['orgmaster', 'ai-pdm', 'financial-management-system'])
  })
})
