import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { ManagementMethodHeading } from '../../managementMethods/headings'
import { WorkspacePortal } from '../workspace/WorkspaceOverlayHosts'

interface Props {
  headings: ManagementMethodHeading[]
  onClose: () => void
  onNavigate: (headingId: string) => void
}

export function ManagementMethodChapterDrawer({ headings, onClose, onNavigate }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [onClose])

  return <WorkspacePortal scope="panel">
    <div className="management-method-chapter-backdrop" onMouseDown={onClose}>
      <aside
        className="management-method-chapter-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="management-method-chapter-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <strong id="management-method-chapter-title">章節</strong>
          <button ref={closeButtonRef} type="button" aria-label="關閉章節" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <nav aria-label="文件章節">
          <ul>
            {headings.map((heading) => (
              <li key={heading.id} data-level={heading.level}>
                <button type="button" onClick={() => onNavigate(heading.id)}>{heading.text}</button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  </WorkspacePortal>
}
