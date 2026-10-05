import {canonicalize,sha256} from './dev012-owner-release-runtime.mjs'

export const LIFECYCLE_SCHEDULER_NAME = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/orgmaster-prod-managed-identity-lifecycle'
export function assertLifecycleSchedulerReadback(job, states = ['PAUSED']) {
  const target = job?.httpTarget
  const retry = job?.retryConfig ?? {}
  if (job?.name !== LIFECYCLE_SCHEDULER_NAME || !states.includes(job.state)
    || job.description !== 'DEV-014 managed identity lifecycle worker trigger'
    || job.schedule !== '* * * * *' || job.timeZone !== 'Asia/Taipei' || job.attemptDeadline !== '60s'
    || target?.httpMethod !== 'POST' || target.uri !== 'https://orgmaster-prod-9536592944.asia-east1.run.app/api/internal/managed-identity-lifecycle/v2'
    || !(target.body == null || target.body === '') || target.oauthToken
    || target.oidcToken?.serviceAccountEmail !== 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'
    || target.oidcToken.audience !== 'https://orgmaster-prod-9536592944.asia-east1.run.app'
    || Object.entries(target.headers ?? {}).some(([name,value]) => name.toLowerCase() !== 'user-agent' || value !== 'Google-Cloud-Scheduler')
    || Number(retry.retryCount ?? 0) !== 0 || ![undefined,'0s'].includes(retry.maxRetryDuration)
    || job.pubsubTarget || job.appEngineHttpTarget) throw new Error('DEV014_LIFECYCLE_ACTIVATION_SCHEDULER_READBACK_INVALID')
  return { name: job.name, description: job.description, schedule: job.schedule,
    timeZone: job.timeZone, attemptDeadline: job.attemptDeadline,
    httpTarget: target, retryConfig: retry }
}

// Only non-credential provider fields enter operator receipts. Scheduler has no
// etag CAS; preserve each actual GET and recheck the fixed template around POST.
export function lifecycleSchedulerSnapshot(job) {
  const config = assertLifecycleSchedulerReadback(job, ['PAUSED','ENABLED'])
  const value = { config, state: job.state,
    ...(typeof job.userUpdateTime === 'string' ? { userUpdateTime: job.userUpdateTime } : {}) }
  return { ...value, readbackSha256: sha256(canonicalize(value)) }
}
