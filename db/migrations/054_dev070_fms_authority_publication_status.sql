-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: FMS authority publication availability
-- compatibility: additive
-- governance-review: DEV-070
BEGIN;
SET LOCAL ROLE jenfu_orgmaster_migrator;

CREATE FUNCTION orgmaster_contract.is_fms_authority_publication_ready_v1()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $ready$
SELECT count(*)=1
FROM orgmaster_core.v_fms_fact_source_v1 source
JOIN orgmaster_core.fms_artifact_facts policy ON policy.batch_id=source.batch_id
  AND policy.artifact_key='orgmaster-governance.v3.json' AND policy.kind='policy' AND policy.lookup_key=''
JOIN orgmaster_core.fms_artifact_facts catalog ON catalog.batch_id=source.batch_id
  AND catalog.artifact_key=policy.artifact_key AND catalog.kind='catalog' AND catalog.lookup_key=''
WHERE source.governance_revision ~ '^[a-f0-9]{64}$'
  AND NULLIF(source.workspace_version_id,'') IS NOT NULL
  AND policy.fact->>'kind'='assignment-governance-v3'
  AND NULLIF(policy.fact->>'id','') IS NOT NULL
  AND catalog.fact->>'validationState'='valid'
  AND catalog.fact->>'sourceKind'='application-contract'
  AND catalog.fact->>'effectState'='not-synchronized'
  AND NULLIF(catalog.fact->>'catalogVersion','') IS NOT NULL
  AND catalog.fact->>'contentSha256' ~ '^[a-f0-9]{64}$'
  AND catalog.fact->>'artifactSha256' ~ '^[a-f0-9]{64}$'
  AND NULLIF(catalog.fact->>'publishedByPrincipalId','') IS NOT NULL
  AND NULLIF(catalog.fact->>'publishedByEmployeeId','') IS NOT NULL;
$ready$;

REVOKE ALL ON FUNCTION orgmaster_contract.is_fms_authority_publication_ready_v1() FROM PUBLIC;
DO $fms_acl$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fms_runtime') THEN
    GRANT EXECUTE ON FUNCTION orgmaster_contract.is_fms_authority_publication_ready_v1() TO fms_runtime;
  END IF;
END; $fms_acl$;

COMMENT ON FUNCTION orgmaster_contract.is_fms_authority_publication_ready_v1() IS
  'Availability of the current FMS publication, including a valid catalog and workspace. Does not grant or count qualifications.';
COMMIT;
