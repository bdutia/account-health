import type { HealthTone } from '../types/dashboard'

export const toneBadgeStyles: Record<HealthTone, string> = {
  healthy: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  watch: 'bg-amber-100 text-amber-700 border-amber-200',
  risk: 'bg-rose-100 text-rose-700 border-rose-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
}

export const toneDotStyles: Record<HealthTone, string> = {
  healthy: 'bg-emerald-500',
  watch: 'bg-amber-500',
  risk: 'bg-rose-500',
  neutral: 'bg-slate-400',
}

export const toneTextStyles: Record<HealthTone, string> = {
  healthy: 'text-emerald-700',
  watch: 'text-amber-700',
  risk: 'text-rose-700',
  neutral: 'text-slate-700',
}
