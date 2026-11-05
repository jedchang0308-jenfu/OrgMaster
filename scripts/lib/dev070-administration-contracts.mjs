import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const columns = (names, nullable = []) => names.split(',').map(name => ({ name, type: name === 'grant_id' || name === 'initialized_by_command_id' ? 'uuid' : /version$|count$/.test(name) && !['contract_version', 'catalog_version'].includes(name) ? 'bigint' : /^(valid_from|valid_until|published_at)$/.test(name) ? 'timestamptz' : name === 'recovery_required' ? 'boolean' : 'text', nullable: nullable.includes(name) }))
export const projections = {
  state: { contractVersion: 'orgmaster.administration-state.v1', function: 'orgmaster_contract.read_administration_state_v1()', columns: columns('contract_version,administration_version,initialized_by_command_id,published_policy_id,published_at,effective_root_count,recovery_required', ['initialized_by_command_id', 'published_policy_id', 'published_at']), readers: ['orgmaster', 'platform', 'orgmaster-owner-verifier'] },
  root: { contractVersion: 'orgmaster.platform-administrator-grants.v1', view: 'orgmaster_contract.v_platform_administrator_grants_v1', columns: columns('contract_version,administration_version,grant_id,principal_id,employee_id,role_code,scope_kind,status,valid_from,valid_until,published_policy_id,published_at', ['valid_until']), readers: ['orgmaster', 'platform'] },
  application: { contractVersion: 'orgmaster.application-administrator-grants.v1', view: 'orgmaster_contract.v_application_administrator_grants_v1', columns: columns('contract_version,administration_version,grant_id,application_id,principal_id,employee_id,role_code,subject_kind,target_principal_id,basis,scope_kind,scope_key,status,valid_from,valid_until,created_by_kind,created_by_id,reason,catalog_version,catalog_content_sha256,stable_role_id,role_definition_hash,published_at', ['scope_key', 'valid_until']), readers: ['orgmaster'] },
  pdm: { contractVersion: 'jenfu.orgmaster.ai-pdm-principal-grants.v5', view: 'orgmaster_contract.v_ai_pdm_principal_effective_grants_v5', columns: columns('contract_version,assignment_version_id,assignment_version,assignment_id,grant_kind,delegation_id,application_id,principal_id,employee_id,subject_kind,target_principal_id,stable_role_id,role_code,catalog_version,scope_kind,scope_key,valid_from,valid_until,published_at,source_assignment_id,source_grant_id,admin_catalog_sha256,role_definition_hash', ['delegation_id', 'target_principal_id', 'scope_key', 'valid_until', 'source_grant_id', 'admin_catalog_sha256', 'role_definition_hash']), readers: ['ai-pdm', 'orgmaster-owner-verifier'] },
  pdmManager: { eligibleFunction: 'orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(text,text,text,text)', lockFunction: 'orgmaster_contract.lock_ai_pdm_role_policy_authority_v2()', readers: ['ai-pdm'] },
  fms: { contractVersion: 'jenfu.orgmaster.fms-authority.v3', view: 'orgmaster_contract.v_fms_authority_v3', readers: ['financial-management-system', 'orgmaster-owner-verifier'] },
}
export const errors = { AUTH_RECENT_REQUIRED: 401, PLATFORM_ADMIN_REQUIRED: 403, ADMINISTRATION_CONFLICT: 409, ADMINISTRATION_COMMAND_CONFLICT: 409, ADMINISTRATION_ALREADY_INITIALIZED: 409, CATALOG_BINDING_CONFLICT: 409, COMMAND_NOT_COMMITTED: 409, ADMIN_TARGET_INVALID: 422, LAST_PLATFORM_ADMIN: 422, ADMINISTRATION_DEPENDENCY_UNAVAILABLE: 503 }
export async function generateAdministrationContracts(root, check = false) {
  // JSON schemas are generated from the exact runtime validators, never hand-maintained copies.
  const { z } = await import('zod')
  const runtime = await import('../../src/governance/administration.ts')
  const payloads = {
    'policy.schema.json': z.toJSONSchema(runtime.administrationPolicySchema),
    'command.schema.json': z.toJSONSchema(runtime.administrationCommandSchema),
    'errors.json': errors,
    'projection-signatures.json': projections,
    'conformance-vectors.json': { contractVersion: 'orgmaster.administration-conformance.v1', rootScope: 'platform', rootValidUntil: null, appScope: 'global', subjectKind: 'principal', basis: 'manual', allowedHumanAccountTypes: ['human_personal', 'human_privileged'], minimumAal: 'aal1', aliasSemantics: 'same-principal-only', ordinaryWriterMayChangeAdministration: false },
  }
  const bytes = Object.fromEntries(Object.entries(payloads).map(([name, value]) => [name, `${JSON.stringify(value, null, 2)}\n`]))
  bytes['contract-manifest.json'] = `${JSON.stringify({ contractVersion: 'orgmaster.administration-manifest.v1', owner: 'orgmaster', policyContract: runtime.ADMINISTRATION_POLICY_CONTRACT, commandContract: runtime.ADMINISTRATION_COMMAND_CONTRACT, files: Object.fromEntries(Object.entries(bytes).map(([name, value]) => [name, sha256(value)])), projections, ddl: ['044_dev070_administration_projection_v1.sql', '045_dev070_administration_commands_v1.sql'] }, null, 2)}\n`
  const destination = resolve(root, 'contracts/orgmaster-administration/v1')
  if (!check) await mkdir(destination, { recursive: true })
  for (const [name, value] of Object.entries(bytes)) {
    const path = resolve(destination, name)
    if (check) { if (await readFile(path, 'utf8') !== value) throw new Error(`ADMINISTRATION_CONTRACT_DRIFT:${name}`) }
    else await writeFile(path, value)
  }
  const fmsManifest=JSON.parse(await readFile(resolve(root,'contracts/orgmaster-fms-authority/v2/contract-manifest.json'),'utf8'))
  Object.assign(fmsManifest,{schemaVersion:'orgmaster.fms-authority-manifest.v3',contractVersion:'jenfu.orgmaster.fms-authority.v3',authorityView:'orgmaster_contract.v_fms_authority_v3',candidateView:'orgmaster_contract.v_fms_principal_candidates_v2',admissionView:'orgmaster_contract.v_fms_principal_admissions_v2'})
  fmsManifest.assignmentKeys.push('subjectKind','basis','targetPrincipalId','sourceKind','sourceGrantId','administrativeDefinitionHash')
  fmsManifest.sourceRules.administration='exact Principal administration grant; sourceKind=administrative_grant, sourceAssignmentId=sourceGrantId=grant UUID; workspace/company-jenfu; current protected dynamic definition hash; no Employee fan-out'
  const fmsBytes=`${JSON.stringify(fmsManifest,null,2)}\n`,fmsPath=resolve(root,'contracts/orgmaster-fms-authority/v3/contract-manifest.json')
  if(check){if(await readFile(fmsPath,'utf8')!==fmsBytes)throw new Error('FMS_V3_MANIFEST_DRIFT')}
  else {await mkdir(resolve(root,'contracts/orgmaster-fms-authority/v3'),{recursive:true});await writeFile(fmsPath,fmsBytes)}
  return { path: destination, manifestSha256: sha256(bytes['contract-manifest.json']),fmsManifestSha256:sha256(fmsBytes) }
}
