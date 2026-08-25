import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Duty } from '../types'

export type DutyCardTone = 'default' | 'readonly'
export type DutyCardBadgeTone = 'neutral' | 'danger' | 'warning' | 'info' | 'success'

export interface DutyCardBadge {
  label: string
  tone?: DutyCardBadgeTone
}

export interface DutyCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  duty: Pick<Duty, 'id' | 'title'>
  badges?: DutyCardBadge[]
  className?: string
  density?: 'regular' | 'compact'
  showTitle?: boolean
  static?: boolean
  status?: ReactNode
  subtitle?: ReactNode
  tone?: DutyCardTone
}

function content({ duty, badges = [], showTitle = true, status, subtitle }: Pick<DutyCardProps, 'duty' | 'badges' | 'showTitle' | 'status' | 'subtitle'>) {
  return <>
    {(showTitle || subtitle) && <span className="duty-card__body">
      {showTitle && <strong className="duty-card__title">{duty.title}</strong>}
      {subtitle && <small className="duty-card__subtitle">{subtitle}</small>}
    </span>}
    {badges.length > 0 && <span className="duty-card__badges" aria-hidden="true">
      {badges.map((badge, index) => <span className={`duty-card__badge duty-card__badge--${badge.tone ?? 'neutral'}`} key={`${badge.label}-${index}`}>{badge.label}</span>)}
    </span>}
    {status && <small className="duty-card__status">{status}</small>}
  </>
}

export function DutyCard({ duty, badges, className = '', density = 'regular', showTitle = true, static: isStatic = false, status, subtitle, tone = 'default', ...buttonProps }: DutyCardProps) {
  const classes = ['duty-card', `duty-card--${density}`, `duty-card--${tone}`, className].filter(Boolean).join(' ')
  const cardContent = content({ duty, badges, showTitle, status, subtitle })

  if (isStatic) return <div className={classes} data-duty-card={duty.id}>{cardContent}</div>

  return <button {...buttonProps} type="button" className={classes} data-duty-card={duty.id}>{cardContent}</button>
}
