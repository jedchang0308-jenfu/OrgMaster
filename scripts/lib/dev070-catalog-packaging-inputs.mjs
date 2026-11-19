// This diagnostic recipe is not a Terraform/profile resource input. Admit only
// its reviewed packaging correction in resource fingerprints; executable/build
// source manifests must continue to bind its exact new bytes independently.
export const DEV070_CATALOG_PACKAGING = Object.freeze({
 path:'infra/google-cloud/dev-040-production-release/dev057-v4-catalog-readback.Dockerfile',
 before:'fd44c040271d74ac370c61746b5d4d73c4313b77',
 after:'a00ab7ae4c128acf2fe518d3cd268c71d585dbb1',
})
export function normalizeCatalogPackagingResourceTree(bytes){
 const {path,before,after}=DEV070_CATALOG_PACKAGING
 const original=`100644 blob ${before}\t${path}`,corrected=`100644 blob ${after}\t${path}`
 return Buffer.from(Buffer.from(bytes).toString('utf8').split('\0').map(entry=>entry===corrected?original:entry).join('\0'))
}
