import {expect,it} from 'vitest'
import {readFinancialRoleCatalog} from './financialRoleCatalogRepository'
it('reads the owner-pinned FMS v5 catalog without exposing system admin as an ordinary role',async()=>{
 const catalog=await readFinancialRoleCatalog()
 expect(catalog.catalogVersion).toBe('financial-management-system.role-catalog.2026-11-05.v5')
 expect(catalog.roles).toHaveLength(7)
 expect(catalog.roles.find(value=>value.stableRoleId==='role-system-admin')).toMatchObject({subjectKind:'principal',assignable:false,assignmentDisposition:'hidden-protected'})
 expect(catalog.roles.find(value=>value.stableRoleId==='role-owner')).toMatchObject({subjectKind:'employee',assignable:true})
})
