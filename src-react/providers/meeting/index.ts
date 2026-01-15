// ============================================
// Meeting Providers - Main Export
// ============================================

export { 
  TeamsAcsMeetingProvider, 
  createTeamsAcsMeetingProvider,
  teamsAcsMeetingProviderRegistration 
} from './TeamsAcsMeetingProvider'

// Re-export types
export type { IMeetingProvider, MeetingProviderConfig } from '@/types/providers'
