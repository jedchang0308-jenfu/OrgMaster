import { describe, expect, it } from 'vitest'
import { parseOrgmasterWindowsTcpListeners, validateOrgmasterLocalListenerSnapshot } from './orgmasterLocalSandboxListener.mjs'

describe('OrgMaster local OS listener verification', () => {
  it('parses the selected TCP port without treating the request Host as proof', () => {
    const listeners = parseOrgmasterWindowsTcpListeners([
      '  TCP    127.0.0.1:5173       0.0.0.0:0              LISTENING       81',
      '  TCP    [::1]:5173           [::]:0                 LISTENING       81',
      '  TCP    127.0.0.1:5174       0.0.0.0:0              LISTENING       99',
    ].join('\n'), 5173)
    expect(listeners).toEqual([
      { address: '127.0.0.1', port: 5173, pid: 81 },
      { address: '::1', port: 5173, pid: 81 },
    ])
  })

  it('accepts only a current-process loopback listener and rejects wildcard or unrelated owners', () => {
    const input = { port: 5173, processId: 81, executablePath: 'C:\\node.exe' }
    expect(validateOrgmasterLocalListenerSnapshot({
      listeners: [{ address: '127.0.0.1', port: 5173, pid: 81 }],
      currentProcess: { pid: 81, executablePath: 'c:/node.exe' },
    }, input)).toBe('127.0.0.1')
    expect(() => validateOrgmasterLocalListenerSnapshot({
      listeners: [{ address: '0.0.0.0', port: 5173, pid: 81 }],
      currentProcess: { pid: 81, executablePath: 'C:\\node.exe' },
    }, input)).toThrow('local_listener_unverified')
    expect(() => validateOrgmasterLocalListenerSnapshot({
      listeners: [{ address: '127.0.0.1', port: 5173, pid: 82 }],
      currentProcess: { pid: 81, executablePath: 'C:\\node.exe' },
    }, input)).toThrow('local_listener_unverified')
  })
})
