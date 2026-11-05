import {expect,it} from 'vitest'
import {administrationFixture,adminAt} from '../src/governance/administration.fixtures'
import {assertFinancialAuthority,FINANCIAL_ROLE_ASSIGNMENT_MANAGE,FINANCIAL_PROTECTED_OPERATIONS} from './applicationEntitlementCommon'
import type {GovernanceDocumentV3} from '../src/governance/types'

it('requires exact FMS app administrator and each explicit catalog capability, including distinct import',()=>{
 const {policy,actor,grant}=administrationFixture()
 const document={draft:policy,activePolicyVersionId:'current',publishedVersions:[{id:'current',kind:'assignment-governance-v3',policy}]} as GovernanceDocumentV3
 expect(()=>assertFinancialAuthority(document,actor,FINANCIAL_ROLE_ASSIGNMENT_MANAGE,adminAt)).toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
 const financial={...grant('p-a','e-a',false,'00000000-0000-4000-8000-000000000070'),applicationId:'financial-management-system' as const,catalogBinding:{catalogVersion:'dynamic-fms-publication',contentSha256:'c'.repeat(64),stableRoleId:'role-system-admin',roleDefinitionHash:'d'.repeat(64)}}
 policy.administration!.grants.push(financial)
 expect(()=>assertFinancialAuthority(document,actor,FINANCIAL_ROLE_ASSIGNMENT_MANAGE,adminAt)).not.toThrow()
 const operations=FINANCIAL_PROTECTED_OPERATIONS.filter(value=>value.includes('.catalog.'))
 expect(operations).toHaveLength(5)
 for(const capability of operations){
  expect(()=>assertFinancialAuthority(document,actor,capability,adminAt)).toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
  policy.managementGrants=[{id:'protected',principalId:actor.principalId,employeeId:actor.employeeId!,applicationId:'financial-management-system',capability,status:'active',validFrom:'2026-01-01T00:00:00.000Z',validTo:null,reason:'明示能力',recordedByPrincipalId:actor.principalId,recordedAt:adminAt}]
  expect(()=>assertFinancialAuthority(document,actor,capability,adminAt)).not.toThrow()
  expect(()=>assertFinancialAuthority(document,{...actor,principalId:'same-employee-other-principal'},capability,adminAt)).toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
  policy.managementGrants=[]
 }
 policy.managementGrants=[{id:'activate-only',principalId:actor.principalId,employeeId:actor.employeeId!,applicationId:'financial-management-system',capability:'financial-management-system.catalog.activate',status:'active',validFrom:'2026-01-01T00:00:00.000Z',validTo:null,reason:'只授啟用',recordedByPrincipalId:actor.principalId,recordedAt:adminAt}]
 expect(()=>assertFinancialAuthority(document,actor,'financial-management-system.catalog.import',adminAt)).toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
})
