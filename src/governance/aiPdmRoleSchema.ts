/** Consumer-owned assignment/presentation schema, not a copy of PDM's capability registry. */
export const AI_PDM_ROLE_PROFILES = [
  ['role-rd','RD',0,'selectable','role-rd'],
  ['role-rd-manager','RD主管',1,'selectable','role-rd-manager'],
  ['role-qa','QA/QC',2,'selectable','role-qa'],
  ['role-manufacturing','生產人員',3,'selectable','role-manufacturing'],
  ['role-production-planning','採購／生管（舊生管指派）',4,'legacy-only','role-procurement'],
  ['role-procurement','採購／生管',4,'selectable','role-procurement'],
  ['role-external-specialist','外部專員',5,'selectable','role-external-specialist'],
  ['role-pdm-admin','PDM管理員',6,'selectable','role-pdm-admin'],
  ['role-system-admin','系統管理員',8,'hidden-protected','role-system-admin'],
] as const
export type AiPdmRoleProfile = {stableRoleId:string;permissionRoleId:string;presentationName:string;presentationOrder:number;
  assignmentDisposition:'selectable'|'legacy-only'|'hidden-protected'}
export function aiPdmRoleProfiles(roles:readonly {stableRoleId:string;displayName:string}[]):AiPdmRoleProfile[]{
  return roles.map((role,index)=>{
    const fixed=AI_PDM_ROLE_PROFILES[index]
    if(fixed){if(role.stableRoleId!==fixed[0])throw new Error('EXTERNAL_CATALOG_INVALID')
      return {stableRoleId:fixed[0],presentationName:fixed[1],presentationOrder:fixed[2],assignmentDisposition:fixed[3],permissionRoleId:fixed[4]}}
    return {stableRoleId:role.stableRoleId,permissionRoleId:role.stableRoleId,presentationName:role.displayName,presentationOrder:index-2,assignmentDisposition:'selectable'}
  })
}
export function aiPdmRoleSelectable(role:{status:string;assignable:boolean;assignmentDisposition?:string}){
  return role.status==='active'&&role.assignable&&(!role.assignmentDisposition||role.assignmentDisposition==='selectable')
}
