import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { useNavigationStore } from '@/stores/navigationStore'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const currentPage = useNavigationStore((state) => state.currentPage)
  const showTabBar = currentPage === 'home'

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <Sidebar />
      <div className="relative flex flex-1 min-w-0 px-5 py-4 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden rounded-3xl border border-border/60 bg-card/90 shadow-[0_18px_70px_rgba(0,0,0,0.12)] backdrop-blur-xl">
          {showTabBar && (
            <div className="px-4 pt-3 shrink-0">
              <div className="rounded-2xl border border-border/60 bg-card/80 px-1.5 py-1 shadow-sm backdrop-blur">
                <TabBar />
              </div>
            </div>
          )}
          <main className="flex-1 min-h-0 overflow-hidden px-4 pb-4">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
