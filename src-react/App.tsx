import { useEffect } from 'react'
import { useTabsStore, selectActiveTab } from '@/stores/tabsStore'
import { useNavigationStore } from '@/stores/navigationStore'
import { usePreferencesStore, applyTheme } from '@/stores/preferencesStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { AppShell } from '@/components/layout/AppShell'
import { HomeTab } from '@/components/tabs/HomeTab'
import { MeetingTabContent } from '@/components/tabs/MeetingTabContent'
import { AboutPage, AgentsPage, HelpPage, HistoryPage, OnboardingWizard, SettingsPage } from '@/components/pages'
import { useInitializeProviders } from '@/hooks'
import { loggers } from '@/lib/logger'

const log = loggers.app

function App() {
  const activeTab = useTabsStore(selectActiveTab)
  const currentPage = useNavigationStore((state) => state.currentPage)
  const theme = usePreferencesStore((state) => state.preferences.ui?.theme || 'light')
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding)
  
  // Initialize provider instances from config (single initialization point)
  const { isInitialized, isInitializing, error } = useInitializeProviders()
  
  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  
  // Log initialization status
  useEffect(() => {
    if (isInitializing) {
      log.info('Initializing providers...')
    } else if (isInitialized) {
      log.info('Providers initialized successfully')
    } else if (error) {
      log.error('Provider initialization error:', undefined, error)
    }
  }, [isInitialized, isInitializing, error])

  const renderContent = () => {
    // If on home page, show tabs system
    if (currentPage === 'home') {
      if (activeTab?.type === 'home') {
        return <HomeTab />
      }
      if (activeTab?.type === 'meeting') {
        return <MeetingTabContent tabId={activeTab.id} />
      }
      return <HomeTab />
    }

    // History page - view past meeting summaries
    if (currentPage === 'history') {
      return <HistoryPage />
    }

    // Other pages
    if (currentPage === 'agents') {
      return <AgentsPage />
    }

    if (currentPage === 'settings') {
      return <SettingsPage />
    }

    if (currentPage === 'help') {
      return <HelpPage />
    }

    if (currentPage === 'about') {
      return <AboutPage />
    }

    return <HomeTab />
  }

  // Show onboarding wizard on first run
  if (!hasCompletedOnboarding) {
    return <OnboardingWizard />
  }

  return (
    <AppShell>
      {error && (
        <div className="p-4 bg-red-100 text-red-800 m-4 rounded dark:bg-red-900/20 dark:text-red-400">
          Provider initialization error: {error}
        </div>
      )}
      {renderContent()}
    </AppShell>
  )
}

export default App
