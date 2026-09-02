interface Props {
  hasInspector: boolean
  dutyConfigurationActive: boolean
  onPointerDownCapture?: React.PointerEventHandler<HTMLElement>
  onFocusCapture?: React.FocusEventHandler<HTMLElement>
  children: React.ReactNode
}

export function OrganizationPanel({ hasInspector, dutyConfigurationActive, onPointerDownCapture, onFocusCapture, children }: Props) {
  return (
    <main
      className={[
        'workspace',
        'workspace--organization-panel',
        hasInspector ? 'has-inspector' : '',
        dutyConfigurationActive ? 'is-duty-configuration' : '',
      ].filter(Boolean).join(' ')}
      onPointerDownCapture={onPointerDownCapture}
      onFocusCapture={onFocusCapture}
    >
      {children}
    </main>
  )
}
