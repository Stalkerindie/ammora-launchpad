import type { ReactNode } from 'react'
import { txLink, addressLink } from '../lib/ammora'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-card p-5 shadow-lg shadow-black/30 ${className}`}>
      {children}
    </div>
  )
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'ghost' | 'danger'
  className?: string
}) {
  const base =
    'rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed'
  const styles =
    variant === 'primary'
      ? 'bg-accent text-ink hover:brightness-110'
      : variant === 'danger'
        ? 'bg-red-500/90 text-white hover:bg-red-500'
        : 'border border-line bg-white/5 text-slate-200 hover:bg-white/10'
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-accent'

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a href={txLink(hash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-accent underline break-all">
      {label ?? `${hash.slice(0, 10)}…${hash.slice(-6)}`}
    </a>
  )
}

export function AddrLink({ addr }: { addr: string }) {
  return (
    <a href={addressLink(addr)} target="_blank" rel="noreferrer" className="font-mono text-xs text-accent underline break-all">
      {addr}
    </a>
  )
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{msg}</div>
  )
}

export function StatusBadge({ status }: { status: number }) {
  const map: Record<number, { label: string; cls: string }> = {
    0: { label: 'Uninitialized', cls: 'bg-slate-500/20 text-slate-300' },
    1: { label: 'Active — trading on curve', cls: 'bg-emerald-500/20 text-emerald-300' },
    2: { label: 'Ready to migrate', cls: 'bg-amber-500/20 text-amber-300' },
    3: { label: 'Migrated — trading on pool', cls: 'bg-violet-500/20 text-violet-300' },
  }
  const s = map[status] ?? { label: `Status ${status}`, cls: 'bg-slate-500/20 text-slate-300' }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>
}
