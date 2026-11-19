import {expect,it} from 'vitest'
import {administrationFixture,adminAt} from '../src/governance/administration.fixtures'
import {assertFinancialAuthority,FINANCIAL_ROLE_ASSIGNMENT_MANAGE,FINANCIAL_PROTECTED_OPERATIONS} from './applicationEntitlementCommon'
import type {GovernanceDocumentV3} from '../src/governance/types'
import {administrativeDefinitionBindings} from '../src/governance/administrativeDefinitions'

it('uses the exact fixed FMS administrator for five catalog operations without granting role or workflow authority',()=>{
 const {policy,actor,grant}=administrationFixture()
 const document={draft:policy,activePolicyVersionId:'current',publishedVersions:[{id:'current',kind:'assignment-governance-v3',policy}]} as GovernanceDocumentV3
 expect(()=>assertFinancialAuthority(document,actor,FINANCIAL_ROLE_ASSIGNMENT_MANAGE,adminAt)).toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
 const financial={...grant('p-a','e-a',false,'00000000-0000-4000-8000-000000000070'),applicationId:'financial-management-system' as const,catalogBinding:administrativeDefinitionBindings['financial-management-system']}
 policy.administration!.grants.push(financial)
 expect(()=>assertFinancialAuthority(document,actor,FINANCIAL_ROLE_ASSIGNMENT_MANAGE,adminAt)).toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
 const operations=FINANCIAL_PROTECTED_OPERATIONS.filter(value=>value.includes('.catalog.'))
 expect(operations).toHaveLength(5)
 for(const capability of operations){
  expect(()=>assertFinancialAuthority(document,actor,capability,adminAt)).not.toThrow()
  expect(()=>assertFinancialAuthority(document,{...actor,principalId:'same-employee-other-principal'},capability,adminAt)).toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
 }
 expect(()=>assertFinancialAuthority(document,actor,'financial-management-system.workflow.read',adminAt)).toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
})
