import type { ReactNode } from 'react'

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function StatusPill({ status }: { status: string }) {
  const label =
    status === 'confirmed'
      ? 'Confirmado por ti'
      : status === 'accountant_reviewed'
        ? 'Revisto pelo contabilista'
        : status === 'suggested'
          ? 'Sugestão'
          : 'A rever'
  return (
    <span
      className={`status-pill ${status === 'confirmed' || status === 'accountant_reviewed' ? 'status-confirmed' : ''}`}
    >
      <span className="status-dot" />
      {label}
    </span>
  )
}
