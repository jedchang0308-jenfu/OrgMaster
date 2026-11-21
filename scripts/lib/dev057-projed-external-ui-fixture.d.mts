export type ProjedExternalOperator = {
  requests: Array<{ method: string; status: number; command?: {
    commandId: string; requestId: string; expectedRevision: string; action: string; note: string
  } }>
  text(): string
  click(input: { boardId: string; contactEmail: string; label: string }): Promise<void>
  reload(): Promise<void>
  close(): Promise<void>
}
export function openProjedExternalOperator(input: {
  origin: string; adminCookie: string; principalId: string
}): Promise<ProjedExternalOperator>
