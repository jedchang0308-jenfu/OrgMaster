import { afterEach, describe, expect, it, vi } from 'vitest'
import { createManagedIdentitySyncWorker, type ManagedIdentityLifecycleRepositoryV2, type ManagedIdentityWorkloadExecutor, type LifecycleClaimV2, type LifecycleCycleControl, type LifecycleReceiptV2, type RefreshClaimV2 } from './orgmasterManagedIdentitySync'
import type { ManagedDirectoryPortV1 } from './orgmasterManagedDirectoryPort'

const executor = { principalId:'workload-org-fixture',owner:'orgmaster',purpose:'managed-identity-lifecycle',bindingVersion:'1' } as const
const consumer = { principalId:'workload-platform-fixture',owner:'platform',purpose:'principal-lifecycle-invalidation',bindingVersion:'1' } as const
const refresh = (id='refresh-1'): RefreshClaimV2=>({requestId:id,attemptCount:1,leaseGeneration:1,directoryCustomerId:'customer-fixture',directoryUserId:'directory-fixture'})
const event = (id='event-1'): LifecycleClaimV2=>({eventId:id,operationId:'operation-'+id,sourceRevision:'source-fixture',snapshotHash:'a'.repeat(64),leaseGeneration:1})
const receipt = (claim:LifecycleClaimV2): LifecycleReceiptV2=>({eventId:claim.eventId,operationId:claim.operationId,sourceRevision:claim.sourceRevision,snapshotHash:claim.snapshotHash,receiptId:'receipt-'+claim.eventId,deliveryPrincipalId:executor.principalId,executorPrincipalId:consumer.principalId,consumerOwner:'platform',principalOnly:true})

function fixture() {
  const repository = {
    resolveExecutor:vi.fn(async()=>executor),resolveConsumer:vi.fn(async()=>consumer),enqueueDue:vi.fn(async()=>{}),
    claimRefresh:vi.fn<ManagedIdentityLifecycleRepositoryV2['claimRefresh']>(async()=>({claims:[] as RefreshClaimV2[],terminalized:0})),
    completeRefresh:vi.fn(async()=> 'applied' as const),retryRefresh:vi.fn(async()=> 'retry' as 'retry'|'terminal'),
    claimLifecycle:vi.fn(async()=>[] as LifecycleClaimV2[]),completeLifecycle:vi.fn(async()=>{}),
    retryLifecycle:vi.fn(async(...args:Parameters<ManagedIdentityLifecycleRepositoryV2['retryLifecycle']>)=>args[3]==='RECEIPT_CONTRACT_INVALID'?'blocked' as const:'retry' as const),
  } satisfies ManagedIdentityLifecycleRepositoryV2
  const directory = {mode:'local-deterministic',writeOperations:0,findExactCandidate:vi.fn(),readByDirectoryKey:vi.fn<ManagedDirectoryPortV1['readByDirectoryKey']>(async()=>({ok:true as const,user:{customerId:'customer-fixture',userId:'directory-fixture',primaryEmail:'synthetic@example.test',directoryState:'present' as const,sourceEtag:'etag'},observedAt:'2026-10-05T00:00:00.000Z'}))} satisfies ManagedDirectoryPortV1
  const dispatch=vi.fn(async (claim:LifecycleClaimV2,_control:LifecycleCycleControl)=>receipt(claim))
  let time=0
  const worker=createManagedIdentitySyncWorker({repository,directory,dispatch,now:()=>time})
  return {repository,directory,dispatch,worker,setTime:(value:number)=>{time=value}}
}
afterEach(()=>vi.useRealTimers())

describe('trusted bounded Directory lifecycle cycle',()=>{
  it('resolves its typed DB executor before any queue action and scans due demand first',async()=>{
    const f=fixture();const result=await f.worker.runOnce()
    expect(result.executorPrincipalId).toBe(executor.principalId)
    expect(f.repository.resolveExecutor.mock.invocationCallOrder[0]).toBeLessThan(f.repository.enqueueDue.mock.invocationCallOrder[0])
    expect(f.repository.enqueueDue).toHaveBeenCalledWith(executor,expect.objectContaining({signal:expect.any(AbortSignal),deadlineAt:50_000}))
    expect(f.repository.enqueueDue.mock.invocationCallOrder[0]).toBeLessThan(f.repository.claimRefresh.mock.invocationCallOrder[0])
  })
  it('does not touch queues or providers when actual executor resolution fails',async()=>{
    const f=fixture();f.repository.resolveExecutor.mockRejectedValueOnce(new Error('workload binding inactive'))
    await expect(f.worker.runOnce()).rejects.toThrow('workload binding inactive')
    expect(f.repository.enqueueDue).not.toHaveBeenCalled();expect(f.directory.readByDirectoryKey).not.toHaveBeenCalled()
  })
  it('requires the owner/purpose/version Principal context rather than a worker label',async()=>{
    const f=fixture();f.repository.resolveExecutor.mockResolvedValueOnce({...executor,principalId:'',bindingVersion:'0'} as never)
    await expect(f.worker.runOnce()).rejects.toThrow('MANAGED_LIFECYCLE_EXECUTOR_INVALID')
    expect(f.repository.enqueueDue).not.toHaveBeenCalled()
  })
  it('does not spend HTTP attempts when the atomic claim returns no grant',async()=>{
    const f=fixture();expect((await f.worker.runOnce()).directoryReads).toBe(0)
    expect(f.directory.readByDirectoryKey).not.toHaveBeenCalled()
  })
  it('waits only for quota_wait, reclaims afterward, and clears both timers',async()=>{
    vi.useFakeTimers();const f=fixture()
    f.repository.claimRefresh
      .mockResolvedValueOnce({claims:[],terminalized:0,retryAfterMilliseconds:1_000})
      .mockResolvedValueOnce({claims:[],terminalized:0})
    const run=f.worker.runOnce()
    for(let i=0;i<8;i++) await Promise.resolve()
    expect(f.repository.claimRefresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(f.repository.claimRefresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    const result=await run
    expect(f.repository.claimRefresh).toHaveBeenCalledTimes(2)
    expect(result.directoryReads).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('exits immediately when an empty queue has no quota_wait hint',async()=>{
    vi.useFakeTimers();const f=fixture()
    await f.worker.runOnce()
    expect(f.repository.claimRefresh).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not sleep when the quota hint reaches the remaining refresh window',async()=>{
    vi.useFakeTimers();const f=fixture()
    f.repository.claimRefresh.mockImplementationOnce(async()=>{
      f.setTime(10_000)
      return {claims:[],terminalized:0,retryAfterMilliseconds:20_000}
    })
    await f.worker.runOnce()
    expect(f.repository.claimRefresh).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('rejects a batch that mixes leased claims with a quota_wait hint',async()=>{
    const f=fixture();f.repository.claimRefresh.mockResolvedValueOnce({claims:[refresh()],terminalized:0,retryAfterMilliseconds:1_000})
    await expect(f.worker.runOnce()).rejects.toThrow('MANAGED_REFRESH_CLAIM_INVALID')
    expect(f.directory.readByDirectoryKey).not.toHaveBeenCalled()
    expect(f.repository.completeRefresh).not.toHaveBeenCalled()
  })
  it('counts SQL-terminalized exhausted leases without another provider read',async()=>{
    const f=fixture();f.repository.claimRefresh.mockResolvedValueOnce({claims:[],terminalized:2})
    const result=await f.worker.runOnce();expect(result.refreshTerminal).toBe(2);expect(result.directoryReads).toBe(0)
  })
  it('stops at forty claims even with a perpetually nonempty queue, with two reads concurrent',async()=>{
    const f=fixture();let sequence=0;let running=0;let maximum=0
    f.repository.claimRefresh.mockImplementation(async()=>({claims:[refresh(String(sequence++)),refresh(String(sequence++))],terminalized:0}))
    f.directory.readByDirectoryKey.mockImplementation(async()=>{ running++;maximum=Math.max(maximum,running);await Promise.resolve();running--;return {ok:true,user:{customerId:'customer-fixture',userId:'directory-fixture',primaryEmail:'synthetic@example.test',directoryState:'present',sourceEtag:'etag'},observedAt:'2026-10-05T00:00:00.000Z'} })
    const result=await f.worker.runOnce();expect(result.directoryReads).toBe(40);expect(result.refreshApplied).toBe(40);expect(maximum).toBe(2)
    expect(f.repository.claimRefresh).toHaveBeenCalledTimes(20)
  })
  it.each([0,6,1.5])('rejects invalid attempt count %s before HTTP',async(attemptCount)=>{
    const f=fixture();f.repository.claimRefresh.mockResolvedValueOnce({claims:[{...refresh(),attemptCount}],terminalized:0})
    await expect(f.worker.runOnce()).rejects.toThrow('MANAGED_REFRESH_CLAIM_INVALID');expect(f.directory.readByDirectoryKey).not.toHaveBeenCalled()
  })
  it('rejects duplicate leased rows before HTTP',async()=>{
    const f=fixture();f.repository.claimRefresh.mockResolvedValueOnce({claims:[refresh(),refresh()],terminalized:0})
    await expect(f.worker.runOnce()).rejects.toThrow('MANAGED_REFRESH_CLAIM_INVALID');expect(f.directory.readByDirectoryKey).not.toHaveBeenCalled()
  })
  it('preserves known-negative semantics as an atomic completion observation',async()=>{
    const f=fixture();f.repository.claimRefresh.mockResolvedValueOnce({claims:[refresh()],terminalized:0})
    f.directory.readByDirectoryKey.mockResolvedValueOnce({ok:false,kind:'not_found',code:'DIRECTORY_NOT_FOUND',observedAt:'2026-10-05T00:00:00.000Z'} as never)
    expect((await f.worker.runOnce()).refreshApplied).toBe(1)
    expect(f.repository.completeRefresh).toHaveBeenCalledWith(executor,expect.any(String),refresh(),{directoryState:'missing',primaryEmail:null,sourceEtag:null},expect.any(Object))
  })
  it.each([['DIRECTORY_TIMEOUT','TIMEOUT'],['DIRECTORY_RATE_LIMITED','RATE_LIMITED'],['OTHER','DIRECTORY_READ_UNAVAILABLE']])('keeps %s provider errors away from trusted observations',async(code,expected)=>{
    const f=fixture();f.repository.claimRefresh.mockResolvedValueOnce({claims:[refresh()],terminalized:0})
    f.directory.readByDirectoryKey.mockResolvedValueOnce({ok:false,kind:'retryable_error',code,observedAt:'2026-10-05T00:00:00.000Z'} as never)
    const result=await f.worker.runOnce();expect(result.refreshRetried).toBe(1);expect(f.repository.completeRefresh).not.toHaveBeenCalled()
    expect(f.repository.retryRefresh).toHaveBeenCalledWith(executor,expect.any(String),refresh(),expected,expect.any(Object))
  })
  it('rejects a mismatched stable Directory key as permanent, without applying the payload',async()=>{
    const f=fixture();f.repository.claimRefresh.mockResolvedValueOnce({claims:[refresh()],terminalized:0})
    f.directory.readByDirectoryKey.mockResolvedValueOnce({ok:true,user:{customerId:'wrong',userId:'directory-fixture',primaryEmail:'synthetic@example.test',directoryState:'present',sourceEtag:null},observedAt:'2026-10-05T00:00:00.000Z'})
    await f.worker.runOnce();expect(f.repository.completeRefresh).not.toHaveBeenCalled()
    expect(f.repository.retryRefresh).toHaveBeenCalledWith(executor,expect.any(String),refresh(),'DIRECTORY_PERMANENT_ERROR',expect.any(Object))
  })
  it('terminalizes a permanent Directory error without applying an observation',async()=>{
    const f=fixture();f.repository.claimRefresh.mockResolvedValueOnce({claims:[refresh()],terminalized:0})
    f.directory.readByDirectoryKey.mockResolvedValueOnce({ok:false,kind:'permanent_error',code:'DIRECTORY_ADAPTER_DISABLED',observedAt:'2026-10-05T00:00:00.000Z'} as never)
    f.repository.retryRefresh.mockResolvedValueOnce('terminal')
    const result=await f.worker.runOnce()
    expect(result.refreshTerminal).toBe(1);expect(result.refreshApplied).toBe(0)
    expect(f.repository.completeRefresh).not.toHaveBeenCalled()
    expect(f.repository.retryRefresh).toHaveBeenCalledWith(executor,expect.any(String),refresh(),'DIRECTORY_PERMANENT_ERROR',expect.any(Object))
  })
  it('does not claim successful completion when a stale lease commit fails',async()=>{
    const f=fixture();f.repository.claimRefresh.mockResolvedValueOnce({claims:[refresh()],terminalized:0});f.repository.completeRefresh.mockRejectedValueOnce(new Error('lease conflict'))
    const result=await f.worker.runOnce();expect(result.refreshApplied).toBe(0);expect(result.commitFailures).toBe(1)
  })
  it('sends only the receipt ID to owner SQL for authoritative receipt verification',async()=>{
    const f=fixture();f.repository.claimLifecycle.mockResolvedValueOnce([event()])
    expect((await f.worker.runOnce()).lifecycleCompleted).toBe(1)
    expect(f.repository.completeLifecycle).toHaveBeenCalledWith(executor,expect.any(String),event(),'receipt-event-1',expect.any(Object))
  })
  it.each(['executorPrincipalId','deliveryPrincipalId','snapshotHash','operationId','sourceRevision','eventId'] as const)('blocks a forged %s receipt rather than reporting an ordinary transport retry',async(field)=>{
    const f=fixture();f.repository.claimLifecycle.mockResolvedValueOnce([event()]);f.dispatch.mockResolvedValueOnce({...receipt(event()),[field]:'wrong'})
    const result=await f.worker.runOnce();expect(result.lifecycleCompleted).toBe(0);expect(result.lifecycleBlocked).toBe(1)
    expect(f.repository.completeLifecycle).not.toHaveBeenCalled()
    expect(f.repository.retryLifecycle).toHaveBeenCalledWith(executor,expect.any(String),event(),'RECEIPT_CONTRACT_INVALID',expect.any(Object))
  })
  it.each(['unknown','inactive'] as const)('refuses an %s Platform consumer binding before lifecycle claims',async(bindingState)=>{
    const f=fixture();const error=new Error(`PLATFORM_WORKLOAD_BINDING_${bindingState.toUpperCase()}`)
    f.repository.resolveConsumer.mockRejectedValueOnce(error)
    await expect(f.worker.runOnce()).rejects.toThrow(error.message)
    expect(f.repository.claimLifecycle).not.toHaveBeenCalled();expect(f.dispatch).not.toHaveBeenCalled()
    expect(f.repository.completeLifecycle).not.toHaveBeenCalled()
  })
  it('rejects an invalid lifecycle claim before dispatch or completion',async()=>{
    const f=fixture();f.repository.claimLifecycle.mockResolvedValueOnce([{...event(),snapshotHash:'invalid'}])
    await expect(f.worker.runOnce()).rejects.toThrow('MANAGED_LIFECYCLE_CLAIM_INVALID')
    expect(f.dispatch).not.toHaveBeenCalled();expect(f.repository.completeLifecycle).not.toHaveBeenCalled()
  })
  it('keeps lost responses replayable and never fabricates a completed event',async()=>{
    const f=fixture();f.repository.claimLifecycle.mockResolvedValueOnce([event()]);f.dispatch.mockRejectedValueOnce(new Error('lost response'))
    const result=await f.worker.runOnce();expect(result.lifecycleCompleted).toBe(0);expect(result.lifecycleRetried).toBe(1)
    expect(f.repository.retryLifecycle).toHaveBeenCalledWith(executor,expect.any(String),event(),'DISPATCH_UNAVAILABLE',expect.any(Object))
  })
  it('separates a durable completion failure from a transport failure',async()=>{
    const f=fixture();f.repository.claimLifecycle.mockResolvedValueOnce([event()]);f.repository.completeLifecycle.mockRejectedValueOnce(new Error('commit unavailable'))
    const result=await f.worker.runOnce();expect(result.lifecycleCompleted).toBe(0)
    expect(f.repository.retryLifecycle).toHaveBeenCalledWith(executor,expect.any(String),event(),'COMPLETION_UNAVAILABLE',expect.any(Object))
  })
  it('expires a hung resolution and performs no new queue action when it later returns',async()=>{
    vi.useFakeTimers();const f=fixture();let finish!: (value:typeof executor)=>void
    f.repository.resolveExecutor.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
    const result=f.worker.runOnce();const rejected=expect(result).rejects.toThrow('MANAGED_LIFECYCLE_DEADLINE')
    await vi.advanceTimersByTimeAsync(50_000);await rejected;finish(executor);await Promise.resolve();await Promise.resolve()
    expect(f.repository.enqueueDue).not.toHaveBeenCalled();expect(f.directory.readByDirectoryKey).not.toHaveBeenCalled()
  })
  it('aborts a hung dispatch at deadline and ignores a late consumer receipt',async()=>{
    vi.useFakeTimers();const f=fixture();f.repository.claimLifecycle.mockResolvedValueOnce([event()])
    let finish!: (value:LifecycleReceiptV2)=>void;let signal:AbortSignal|undefined
    f.dispatch.mockImplementationOnce((_claim,control)=>{signal=control.signal;return new Promise(resolve=>{finish=resolve})})
    const run=f.worker.runOnce();const rejected=expect(run).rejects.toThrow('MANAGED_LIFECYCLE_DEADLINE')
    await vi.advanceTimersByTimeAsync(50_000);await rejected
    expect(signal?.aborted).toBe(true)
    finish(receipt(event()));await Promise.resolve();await Promise.resolve();await Promise.resolve()
    expect(f.repository.completeLifecycle).not.toHaveBeenCalled();expect(f.repository.retryLifecycle).not.toHaveBeenCalled()
  })
  it('does not complete a read that returns after the cycle deadline',async()=>{
    const f=fixture();f.repository.claimRefresh.mockResolvedValueOnce({claims:[refresh()],terminalized:0})
    f.directory.readByDirectoryKey.mockImplementationOnce(async()=>{f.setTime(50_001);return {ok:true,user:{customerId:'customer-fixture',userId:'directory-fixture',primaryEmail:'synthetic@example.test',directoryState:'present',sourceEtag:null},observedAt:'2026-10-05T00:00:00.000Z'}})
    await expect(f.worker.runOnce()).rejects.toThrow('MANAGED_LIFECYCLE_DEADLINE')
    expect(f.repository.completeRefresh).not.toHaveBeenCalled();expect(f.repository.retryRefresh).not.toHaveBeenCalled();expect(f.dispatch).not.toHaveBeenCalled()
  })
})


describe('managed identity lifecycle Scheduler executor binding fence', () => {
  it.each([
    ['principal ID', { ...executor, principalId: 'workload-orgmaster-other' }],
    ['binding version', { ...executor, bindingVersion: '2' }],
  ])('rejects a caller with a different %s before any queue or provider action', async (_label, expectedExecutor) => {
    const f = fixture()
    await expect(f.worker.runOnce(expectedExecutor)).rejects.toThrow('MANAGED_LIFECYCLE_CALLER_BINDING_CHANGED')
    expect(f.repository.resolveExecutor).toHaveBeenCalledTimes(1)
    expect(f.repository.enqueueDue).not.toHaveBeenCalled()
    expect(f.repository.claimRefresh).not.toHaveBeenCalled()
    expect(f.repository.claimLifecycle).not.toHaveBeenCalled()
    expect(f.directory.readByDirectoryKey).not.toHaveBeenCalled()
    expect(f.dispatch).not.toHaveBeenCalled()
  })

  it('accepts the same Principal and binding version only after actual executor resolution', async () => {
    const f = fixture()
    const result = await f.worker.runOnce({ ...executor })
    expect(result.executorPrincipalId).toBe(executor.principalId)
    expect(f.repository.resolveExecutor.mock.invocationCallOrder[0])
      .toBeLessThan(f.repository.enqueueDue.mock.invocationCallOrder[0])
    expect(f.repository.enqueueDue).toHaveBeenCalledWith(executor, expect.objectContaining({
      signal: expect.any(AbortSignal),
      deadlineAt: 50_000,
    }))
  })

  it('rejects a caller binding with the wrong owner before queue or provider action', async () => {
    const f = fixture()
    const wrongOwner = { ...executor, owner: 'platform' } as unknown as typeof executor
    await expect(f.worker.runOnce(wrongOwner)).rejects.toThrow('MANAGED_LIFECYCLE_EXECUTOR_INVALID')
    expect(f.repository.resolveExecutor).toHaveBeenCalledTimes(1)
    expect(f.repository.enqueueDue).not.toHaveBeenCalled()
    expect(f.repository.claimRefresh).not.toHaveBeenCalled()
    expect(f.repository.claimLifecycle).not.toHaveBeenCalled()
    expect(f.directory.readByDirectoryKey).not.toHaveBeenCalled()
    expect(f.dispatch).not.toHaveBeenCalled()
  })
})
