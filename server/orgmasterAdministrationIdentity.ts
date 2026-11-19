import type {GovernanceOrgSource} from '../src/governance/types'
import type {OrgmasterDatabase} from './orgmasterDatabase'
/** Current native admission, obtained in the caller's existing owner transaction. */
export async function withAdministrativePrincipalSource(source:GovernanceOrgSource,database:Pick<OrgmasterDatabase,'query'>):Promise<GovernanceOrgSource>{
 const result=await database.query(`SELECT principal_id AS "principalId",min(employee_id) AS "employeeId",min(account_type) AS "accountType",'active' AS status FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE employee_status='active' AND account_type IN('human_personal','human_privileged') GROUP BY principal_id HAVING count(DISTINCT employee_id)=1 AND count(DISTINCT account_type)=1`)
 return {...source,administrativePrincipals:result.rows as NonNullable<GovernanceOrgSource['administrativePrincipals']>}
}
