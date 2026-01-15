import { useTabsStore } from '@/stores/tabsStore'
import { cn } from '@/lib/utils'
import { Home, Phone } from 'lucide-react'
import type { Tab, MeetingTab } from '@/types'

export function TabBar() {
  const tabs = useTabsStore((state) => state.tabs)
  const activeTabId = useTabsStore((state) => state.activeTabId)
  const setActiveTab = useTabsStore((state) => state.setActiveTab)

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-1 py-1">
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onActivate={() => setActiveTab(tab.id)}
        />
      ))}
    </div>
  )
}

interface TabItemProps {
  tab: Tab
  isActive: boolean
  onActivate: () => void
  // onClose?: () => void // Unused for now
}

function TabItem({ tab, isActive, onActivate }: TabItemProps) {
  const isMeeting = tab.type === 'meeting'
  const meetingTab = isMeeting ? (tab as MeetingTab) : null

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-150',
        isMeeting
          ? isActive
            ? 'border-green-500/30 bg-gradient-to-r from-green-500/10 to-green-500/5 text-foreground shadow-md cursor-pointer'
            : 'border-green-500/20 bg-green-500/5 text-muted-foreground hover:border-green-500/40 hover:text-foreground cursor-pointer'
          : isActive
            ? 'border-border bg-background text-foreground shadow-sm cursor-pointer'
            : 'border-transparent bg-card/80 text-muted-foreground hover:border-border/60 hover:text-foreground cursor-pointer'
      )}
      onClick={onActivate}
    >
      {/* Tab Icon */}
      <span className={cn(
        'flex-shrink-0',
        isActive ? 'text-primary' : 'text-muted-foreground'
      )}>
        {tab.type === 'home' ? (
          <Home className="w-4 h-4" />
        ) : (
          <Phone className={cn(
            'w-4 h-4',
            meetingTab?.isActive && 'text-green-500'
          )} />
        )}
      </span>

      {/* Tab Title */}
      <span className={cn(
        'text-sm truncate max-w-[150px]',
        isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
      )}>
        {tab.title}
      </span>

      {/* Active indicator for meetings */}
      {meetingTab?.isActive && (
        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  )
}

export default TabBar
