import type { PropsWithChildren } from 'react'
import { Link, useLocation } from 'react-router-dom'

interface DashboardLayoutProps extends PropsWithChildren {
  title: string
  owner?: string
}

const QUARTERS = ['Q1 2024', 'Q2 2024', 'Q3 2024', 'Q4 2024']

export function DashboardLayout({ title, owner, children }: DashboardLayoutProps) {
  const location = useLocation()
  const isDetail = location.pathname.includes('/account/')

  return (
    <main className="min-h-screen bg-page text-slate-800">
      <header className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 text-slate-100 shadow-xl">
        <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-3 px-4 py-4 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="font-semibold tracking-wide text-slate-200">
              {isDetail ? (
                <Link className="hover:text-white" to="/">
                  ← Back to Dashboard
                </Link>
              ) : (
                'Internal Stakeholder View'
              )}
            </div>
            <label className="flex items-center gap-2 font-semibold text-slate-200">
              Select Quarter:
              <select className="rounded-md border border-slate-500 bg-slate-50 px-3 py-1 text-slate-800">
                {QUARTERS.map((quarter) => (
                  <option key={quarter}>{quarter}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
            {owner ? (
              <div className="rounded-xl border border-slate-500 bg-slate-100/10 px-4 py-2 text-sm text-slate-100">
                Account Owner: <span className="font-semibold">{owner}</span>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <section className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-8">{children}</section>
    </main>
  )
}
