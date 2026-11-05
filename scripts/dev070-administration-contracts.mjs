import { generateAdministrationContracts } from './lib/dev070-administration-contracts.mjs'
console.log(JSON.stringify(await generateAdministrationContracts(process.cwd(), process.argv.includes('--check'))))
