import {useEffect,useState} from 'react'
import {commitAdministration,GovernanceApiError,loadAdministrationCommand,loadAdministrationWorkspace,previewAdministration,type AdministrationCommandReceipt,type AdministrationPreview,type AdministrationWorkspace} from '../governance/apiClient'
import {ADMINISTRATION_BATCH_COMMAND_CONTRACT,ADMINISTRATION_COMMAND_CONTRACT,ADMINISTRATIVE_APPLICATION_IDS} from '../governance/administrationContract'
import type {AdministrationCommand} from '../governance/administration'
import type {Employee} from '../types'
import type {AdministrativeGrantV1} from '../governance/types'
const labels={orgmaster:'OrgMaster 系統管理員','ai-pdm':'PDM 系統管理員','financial-management-system':'FMS 系統管理員'}
const localDateTime=(value:string)=>value?new Date(Date.parse(value)-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,-1):''
export function GovernanceAdministrators({employees,onChanged}:{employees:Employee[];onChanged?:()=>void}) {
 const [workspace,setWorkspace]=useState<AdministrationWorkspace|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [principalId,setPrincipalId]=useState(''),[employeeId,setEmployeeId]=useState(''),[application,setApplication]=useState('orgmaster'),[reason,setReason]=useState('')
 const [pending,setPending]=useState<AdministrationCommand|null>(null),[preview,setPreview]=useState<AdministrationPreview|null>(null),[receipt,setReceipt]=useState<AdministrationCommandReceipt|null>(null),[unknown,setUnknown]=useState(false)
 const [replacement,setReplacement]=useState<AdministrativeGrantV1|null>(null),[validFrom,setValidFrom]=useState(''),[validTo,setValidTo]=useState('')
 const report=(error:unknown)=>setError(error instanceof GovernanceApiError?`${error.code}：${error.code==='AUTH_RECENT_REQUIRED'?'請重新透過 Google 驗證。':'請重新載入或查詢原操作結果。'}`:'平台管理授權目前無法讀取。')
 async function refresh(){try{setWorkspace((await loadAdministrationWorkspace()).payload)}catch(error){report(error)}}
 useEffect(()=>{void refresh()},[])
 const name=(id:string)=>{const value=employees.find(employee=>employee.id===id)?.name;return value&&/\p{Script=Han}/u.test(value)?value:'員工'}
 async function makePreview(grant?:AdministrativeGrantV1){
  if(!workspace||busy||unknown)return;setBusy(true);setError('');setReceipt(null)
  const batch=application==='all-applications'
  const commandId=crypto.randomUUID(),normalizedReason=reason.normalize('NFC').trim()
  const expected={governanceRevision:workspace.governanceRevision,organizationRevision:workspace.organizationRevision,administrationVersion:workspace.administrationVersion}
  const target=grant?null:{principalId,employeeId,applicationId:application==='platform'||batch?null:application as keyof typeof labels,validFrom:validFrom?new Date(validFrom).toISOString():new Date().toISOString(),validTo:application!=='platform'&&validTo?new Date(validTo).toISOString():null}
  const command:AdministrationCommand=batch
   ?{contractVersion:ADMINISTRATION_BATCH_COMMAND_CONTRACT,commandId,operation:'grant_application_administrators_batch',target:target!,grantId:null,applications:[...ADMINISTRATIVE_APPLICATION_IDS],reason:normalizedReason,expected,catalogBindings:workspace.catalogBindings}
   :{contractVersion:ADMINISTRATION_COMMAND_CONTRACT,commandId,operation:grant?grant.roleCode==='platform_super_admin'?'revoke_platform_administrator':'revoke_application_administrator':replacement?'replace_application_administrator':application==='platform'?'grant_platform_administrator':'grant_application_administrator',target,grantId:grant?.id??replacement?.id??null,reason:normalizedReason,expected,catalogBindings:workspace.catalogBindings}
  try{setPending(command);setPreview((await previewAdministration(command)).payload)}catch(error){report(error)}finally{setBusy(false)}
 }
 function editLifetime(grant:AdministrativeGrantV1){setReplacement(grant);setPrincipalId(grant.principalId);setEmployeeId(grant.employeeId);setApplication(grant.applicationId!);setValidFrom(grant.validFrom);setValidTo(grant.validTo??'');setPreview(null);setReceipt(null)}
 async function confirm(){if(!pending||!preview||busy)return;setBusy(true);setError('')
  try{const result=(await commitAdministration({...pending,previewHash:preview.previewHash})).payload;setReceipt(result);setPreview(null);setUnknown(false);await refresh();onChanged?.()}
  catch(error){report(error);if(!(error instanceof GovernanceApiError)||error.status>=500)setUnknown(true)}finally{setBusy(false)}
 }
 async function recover(){if(!pending||busy)return;setBusy(true);setError('')
  try{setReceipt((await loadAdministrationCommand(pending.commandId)).payload);setPreview(null);setUnknown(false);await refresh();onChanged?.()}catch(error){report(error)}finally{setBusy(false)}
 }
 return <section className="governance-section" aria-label="平台管理員"><h2>平台管理員</h2>
 {error&&<p role="alert">{error}</p>}
 {!workspace&&!error&&<p role="status">載入管理授權…</p>}
 {workspace&&!workspace.initialized&&<p role="status">平台管理員尚未初始化，需由 owner 執行一次性初始化。</p>}
 {workspace&&<><table className="governance-table"><thead><tr><th>管理身分</th><th>員工</th><th>狀態</th><th>操作</th></tr></thead><tbody>{workspace.grants.map(grant=><tr key={grant.id}><td>{grant.roleCode==='platform_super_admin'?'平台超級管理員':labels[grant.applicationId!]}</td><td>{name(grant.employeeId)}</td><td>{grant.status==='active'?'有效':'已撤銷'}</td><td>{workspace.admission.mutate&&grant.status==='active'&&<><button type="button" disabled={busy||unknown||!reason.trim()} onClick={()=>void makePreview(grant)}>預覽撤銷</button>{grant.applicationId&&<button type="button" disabled={busy||unknown} onClick={()=>editLifetime(grant)}>調整期限</button>}</>}</td></tr>)}</tbody></table>
 {workspace.initialized&&workspace.admission.mutate&&!workspace.catalogBindings['financial-management-system']&&<p role="status">FMS 管理目錄尚未由系統發布流程採用；目前不能授予 FMS 系統管理員，無需由使用者另行安裝。</p>}
 {workspace.initialized&&workspace.admission.mutate&&<form onSubmit={event=>{event.preventDefault();void makePreview()}}>
 <label>員工<select value={employeeId} disabled={!!replacement} onChange={event=>{setEmployeeId(event.target.value);const choices=workspace.eligiblePrincipals?.filter(value=>value.employeeId===event.target.value)??[];setPrincipalId(choices.length===1?choices[0].principalId:'');setPreview(null)}} required><option value="">選擇員工</option>{employees.filter(employee=>/\p{Script=Han}/u.test(employee.name)).map(employee=><option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
 <label>登入身分<select value={principalId} disabled={!!replacement} onChange={event=>{setPrincipalId(event.target.value);setPreview(null)}} required><option value="">選擇登入身分</option>{workspace.eligiblePrincipals?.filter(value=>value.employeeId===employeeId).map((value,index)=><option key={value.principalId} value={value.principalId}>{value.accountType==='human_personal'?'日常帳號':'特權帳號'}{index>0?` ${index+1}`:''}</option>)}</select></label>
 <label>管理身分<select value={application} disabled={!!replacement} onChange={event=>{setApplication(event.target.value);setPreview(null)}}><option value="all-applications" disabled={ADMINISTRATIVE_APPLICATION_IDS.some(id=>!workspace.catalogBindings[id])}>全部應用系統管理員</option><option value="platform">平台超級管理員</option>{Object.entries(labels).map(([id,label])=><option key={id} value={id} disabled={!workspace.catalogBindings[id as keyof typeof labels]}>{label}</option>)}</select></label>
 <label>原因<input value={reason} onChange={event=>{setReason(event.target.value);setPreview(null)}} required maxLength={240}/></label><button type="submit" className="button button--primary" disabled={busy||unknown}>預覽管理授權</button>
 <label>生效時間（空白為現在）<input type="datetime-local" step="0.001" value={localDateTime(validFrom)} onChange={event=>{setValidFrom(event.target.value?new Date(event.target.value).toISOString():'');setPreview(null)}}/></label>
 {application!=='platform'&&<label>到期時間（空白為無期限）<input type="datetime-local" step="0.001" value={localDateTime(validTo)} onChange={event=>{setValidTo(event.target.value?new Date(event.target.value).toISOString():'');setPreview(null)}}/></label>}
 {replacement&&<button type="button" disabled={busy||unknown} onClick={()=>{setReplacement(null);setValidFrom('');setValidTo('');setPreview(null)}}>取消期限調整</button>}
 </form>}
 {preview&&!unknown&&<div role="status"><p>{name(preview.diff.employeeId??employeeId)} · {preview.diff.applicationIds?.length?'全部應用系統管理員':preview.diff.applicationId?labels[preview.diff.applicationId]:'平台超級管理員'} · {preview.diff.operation?.startsWith('revoke_')?'撤銷':'授予'}</p><p>{preview.diff.result==='no_change'?'現有授權相同，不新增發布。':'管理授權將直接發布。'}</p><button type="button" className="button button--primary" disabled={busy} onClick={()=>void confirm()}>確認套用管理授權</button><button type="button" disabled={busy} onClick={()=>{setPreview(null);setPending(null)}}>取消</button></div>}
 {unknown&&<p role="status">操作結果待確認。<button type="button" disabled={busy} onClick={()=>void recover()}>查詢操作結果</button></p>}
 {receipt&&<p role="status">管理授權已提交（版本 {receipt.administrationVersion}），{receipt.activation==='acknowledged'?'已生效':'尚待各系統生效'}。<button type="button" disabled={busy} onClick={()=>void recover()}>重新查詢生效進度</button></p>}
 </>}
 </section>
}
