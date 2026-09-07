import type { CSSProperties, ReactNode } from 'react'

export interface WorkbenchListFrameProps {
  title: string
  count?: ReactNode
  search?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function WorkbenchListFrame({ title, count, search, actions, children, className = '' }: WorkbenchListFrameProps) {
  return (
    <section className={`workbench-list-frame${className ? ` ${className}` : ''}`} aria-label={`${title}清單`}>
      <header className="workbench-list-frame__header">
        <strong>{title}</strong>
        {count !== undefined && <span className="workbench-list-frame__count">{count}</span>}
        {actions && <div className="workbench-list-frame__actions">{actions}</div>}
      </header>
      {search && <div className="workbench-list-frame__search">{search}</div>}
      <div className="workbench-list-frame__body">{children}</div>
    </section>
  )
}

export interface WorkbenchListRowProps {
  children: ReactNode
  selected?: boolean
  className?: string
  onClick?: () => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void
  [key: string]: unknown
}

export function WorkbenchListRow({ children, selected = false, className = '', onClick, onKeyDown, ...props }: WorkbenchListRowProps) {
  return (
    <article
      {...props}
      className={`workbench-list-row${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
      data-workbench-row
      data-selected={selected ? 'true' : 'false'}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </article>
  )
}

export interface WorkbenchDetailFrameProps {
  title?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function WorkbenchDetailFrame({ title, eyebrow, actions, children, className = '' }: WorkbenchDetailFrameProps) {
  return (
    <section className={`workbench-detail-frame${className ? ` ${className}` : ''}`}>
      {(title || eyebrow || actions) && <header className="workbench-detail-frame__header">
        <div className="workbench-detail-frame__heading">
          {eyebrow && <span>{eyebrow}</span>}
          {title && <h2>{title}</h2>}
        </div>
        {actions && <div className="workbench-detail-frame__actions">{actions}</div>}
      </header>}
      <div className="workbench-detail-frame__body">{children}</div>
    </section>
  )
}

export function workbenchWidthStyle(width: number | null): CSSProperties {
  return { '--workspace-list-width': width ? `${width}px` : 'max-content' } as CSSProperties
}
