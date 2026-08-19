import { Link } from 'react-router-dom'

export type HealthAnimationVariant = 'pulseMonitor' | 'heartbeat' | 'dnaHelix' | 'stethoscope' | 'securityPulse'

interface HealthWidgetLinkProps {
  to: string
  title: string
  description: string
  variant: HealthAnimationVariant
}

const ACCENTS: Record<HealthAnimationVariant, { border: string; chipBg: string; chipBorder: string; text: string }> = {
  pulseMonitor: {
    border: 'hover:border-sky-300',
    chipBg: 'bg-sky-50',
    chipBorder: 'border-sky-200',
    text: 'text-sky-700',
  },
  heartbeat: {
    border: 'hover:border-rose-300',
    chipBg: 'bg-rose-50',
    chipBorder: 'border-rose-200',
    text: 'text-rose-700',
  },
  dnaHelix: {
    border: 'hover:border-indigo-300',
    chipBg: 'bg-indigo-50',
    chipBorder: 'border-indigo-200',
    text: 'text-indigo-700',
  },
  stethoscope: {
    border: 'hover:border-teal-300',
    chipBg: 'bg-teal-50',
    chipBorder: 'border-teal-200',
    text: 'text-teal-700',
  },
  securityPulse: {
    border: 'hover:border-amber-300',
    chipBg: 'bg-amber-50',
    chipBorder: 'border-amber-200',
    text: 'text-amber-700',
  },
}

function AnimationChip({ variant }: { variant: HealthAnimationVariant }) {
  if (variant === 'pulseMonitor') {
    return (
      <svg viewBox="0 0 64 64" className="h-8 w-8 text-sky-600" fill="none">
        <path
          d="M4 34h9l5-18 8 34 6-24 4 8h24"
          stroke="currentColor"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={120}
          className="animate-health-pulse-line"
        />
        <circle cx="56" cy="34" r="4" className="fill-sky-500 animate-health-pulse-dot" />
      </svg>
    )
  }

  if (variant === 'heartbeat') {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-rose-600 animate-health-heartbeat" fill="currentColor">
        <path d="M12 21s-6.7-4.35-9.3-8.55C.9 9.4 1.9 5.6 5.2 4.4c2-.75 4 .1 5.2 1.9L12 8l1.6-1.7c1.2-1.8 3.2-2.65 5.2-1.9 3.3 1.2 4.3 5 2.5 8.05C18.7 16.65 12 21 12 21z" />
      </svg>
    )
  }

  if (variant === 'dnaHelix') {
    return (
      <div className="relative h-8 w-8 [perspective:220px]">
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 [transform-style:preserve-3d] animate-health-dna-rotate">
          <span className="h-8 w-1.5 rounded-full bg-indigo-500" />
          <span className="h-8 w-1.5 rounded-full bg-violet-400 [transform:rotateY(90deg)]" />
        </div>
        <span className="absolute left-1/2 top-2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-indigo-300 animate-health-dna-rung" />
        <span className="absolute left-1/2 top-1/2 h-0.5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-300 animate-health-dna-rung [animation-delay:0.3s]" />
        <span className="absolute bottom-2 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-indigo-300 animate-health-dna-rung [animation-delay:0.6s]" />
      </div>
    )
  }

  if (variant === 'stethoscope') {
    return (
      <div className="relative flex h-8 w-8 items-center justify-center">
        <span className="absolute h-8 w-8 rounded-full border-2 border-teal-400 animate-health-stethoscope-ring" />
        <svg
          viewBox="0 0 24 24"
          className="relative h-6 w-6 origin-top text-teal-600 animate-health-stethoscope-sway"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path d="M6 3v6a4 4 0 0 0 8 0V3" strokeLinecap="round" />
          <path d="M10 13v1a4 4 0 0 0 6 3.5" strokeLinecap="round" />
          <circle cx="18" cy="16" r="2.6" />
        </svg>
      </div>
    )
  }

  return (
    <div className="relative flex h-8 w-8 items-center justify-center">
      <span className="absolute h-8 w-8 rounded-full border-2 border-amber-400 animate-health-security-ring" />
      <svg viewBox="0 0 24 24" className="relative h-6 w-6 text-amber-600 animate-health-security-shield" fill="currentColor">
        <path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5l-8-3z" />
      </svg>
    </div>
  )
}

export function HealthWidgetLink({ to, title, description, variant }: HealthWidgetLinkProps) {
  const accent = ACCENTS[variant]

  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg ${accent.border}`}
    >
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border ${accent.chipBg} ${accent.chipBorder}`}>
        <AnimationChip variant={variant} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-bold ${accent.text}`}>{title}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
      <span className={`text-lg font-bold transition group-hover:translate-x-1 ${accent.text}`}>→</span>
    </Link>
  )
}
