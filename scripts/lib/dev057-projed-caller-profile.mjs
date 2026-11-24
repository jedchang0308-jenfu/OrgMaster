import { canonicalize } from './dev012-production-migration-runner.mjs'

export const DEV057_PROJED_CALLER_PINS = Object.freeze({
  ORGMASTER_PROJED_CALLER_EMAIL: 'projed-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com',
  ORGMASTER_PROJED_CALLER_SUBJECT: '109317730993775447820',
})
const names = Object.keys(DEV057_PROJED_CALLER_PINS)
const same = (a, b) => canonicalize(a) === canonicalize(b)
const fail = () => { throw Object.assign(new Error('DEV057_CALLER_PROFILE_INVALID'), { code: 'DEV057_CALLER_PROFILE_INVALID' }) }
function assertProfile(profile) {
  if (profile.application?.id !== 'orgmaster' || profile.target?.projectId !== 'jenfu-platform-prod'
    || names.some(name => profile.environment?.fixedValues?.[name] !== DEV057_PROJED_CALLER_PINS[name]
      || profile.environment.requiredPlainEnvironmentNames.filter(item => item === name).length !== 1)) fail()
}

// This view validates an existing revision; it is never a deployment profile.
export function dev057PreCallerRuntimeProfile(profile) {
  assertProfile(profile)
  const before = structuredClone(profile)
  before.environment.requiredPlainEnvironmentNames = before.environment.requiredPlainEnvironmentNames.filter(name => !names.includes(name))
  for (const name of names) delete before.environment.fixedValues[name]
  return before
}

export function isDev057CallerProfileAppend(before, after) {
  try { return same(before, dev057PreCallerRuntimeProfile(after)) } catch { return false }
}

export function planDev057CallerEnvironment(profile, previous) {
  assertProfile(profile)
  if (names.every(name => previous[name] === DEV057_PROJED_CALLER_PINS[name])) return previous
  if (names.some(name => Object.hasOwn(previous, name))) fail()
  return { ...previous, ...DEV057_PROJED_CALLER_PINS }
}

export function isDev057CallerEnvironmentAppend(profile, previous, planned) {
  try {
    assertProfile(profile)
    return names.every(name => !Object.hasOwn(previous, name)) && same(planned, { ...previous, ...DEV057_PROJED_CALLER_PINS })
  } catch { return false }
}
