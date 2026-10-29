export function validateOrgmasterLocalListenerSnapshot(snapshot: unknown, options: { port: number; processId: number; executablePath: string }): string
export function parseOrgmasterWindowsTcpListeners(output: string, port: number): Array<{ address: string; port: number; pid: number }>
export function readOrgmasterWindowsLocalListenerSnapshot(port: number, processId?: number): Promise<unknown>
export function createOrgmasterLocalListenerVerifier(options?: { readSnapshot?: (port: number, processId: number) => Promise<unknown>; processId?: number; executablePath?: string }): (config: { origin: string }) => Promise<string>
