import { useState, useMemo, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useTabsStore } from '@/stores/tabsStore'
import { useNavigationStore } from '@/stores/navigationStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { MeetingInfo } from '@/types'
import { 
  Search, Clock, Users, MessageSquare, HelpCircle, Bot, 
  Calendar, ChevronDown, ChevronRight, Download, Trash2, 
  FileText, History as HistoryIcon
} from 'lucide-react'

// Helper to strip HTML mention tags from Teams chat messages while keeping markdown-friendly spacing
function stripMentionHtml(text: string): string {
  let cleaned = text
  cleaned = cleaned.replace(/<\/?p[^>]*>/gi, '\n')
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n')
  cleaned = cleaned.replace(/<span[^>]*itemtype="http:\/\/schema\.skype\.com\/Mention"[^>]*>([^<]+)<\/span>/gi, '@$1')
  cleaned = cleaned.replace(/<[^>]+>/g, '')
  cleaned = cleaned.replace(/[ \t]+/g, ' ')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = cleaned.trim()
  return cleaned
}

// Helper to format duration (matching end-of-call summary style)
function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '—'
  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// Helper to format date
function formatDate(date: Date | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  })
}

function formatTime(date: Date | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatNumber(value: number | string | undefined): string {
  if (value === undefined) return '—'
  if (typeof value === 'string') return value
  return value.toLocaleString('en-US')
}

// Single meeting card with expandable summary
interface MeetingCardProps {
  meeting: MeetingInfo
  onExport: () => void
}

function MeetingCard({ meeting, onExport }: MeetingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasSummary = !!meeting.summary
  
  const stats = meeting.summary?.stats
  const transcript = meeting.summary?.transcript || []
  const questions = meeting.summary?.questions || []
  const aiSummary = meeting.summary?.aiSummary

  const statCards = stats ? [
    { icon: Clock, label: 'Duration', value: formatDuration(stats.totalDuration) },
    { icon: Users, label: 'Participants', value: formatNumber(meeting.summary?.participants.length) },
    { icon: MessageSquare, label: 'Exchanges', value: formatNumber(stats.totalCaptions) },
    { icon: HelpCircle, label: 'Questions Asked', value: formatNumber(stats.totalQuestions) },
    { icon: Bot, label: 'Agent Responses', value: formatNumber(stats.totalResponses) },
  ] : []
  
  return (
    <Card className={cn(
      "transition-all duration-200",
      isExpanded && "ring-2 ring-primary/30"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-0.5 hover:bg-muted rounded transition-colors"
                disabled={!hasSummary}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              <CardTitle className="text-base truncate">{meeting.title}</CardTitle>
              {!hasSummary && (
                <Badge variant="secondary" className="text-xs">No Summary</Badge>
              )}
            </div>
            <CardDescription className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(meeting.joinedAt)} at {formatTime(meeting.joinedAt)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(meeting.duration)}
              </span>
              {meeting.participantCount && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {meeting.participantCount}
                </span>
              )}
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-1">
            {hasSummary && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={onExport}
                title="Export Summary"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      {/* Expanded Summary Section */}
      {isExpanded && hasSummary && (
        <CardContent className="pt-0">
          <div className="border-t pt-4 mt-2 space-y-4">
            {/* Stats Row */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {statCards.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-border bg-muted/40 p-3 text-center shadow-sm"
                  >
                    <stat.icon className="w-5 h-5 mx-auto mb-2 text-primary" />
                    <div className="text-lg font-semibold text-foreground leading-tight">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            )}
            
            {/* AI Summary */}
            {aiSummary && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  AI Summary
                </h4>
                <div className="text-sm leading-relaxed text-muted-foreground">
                  <ReactMarkdown
                    components={{
                      h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-2 text-foreground">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-2 text-foreground">{children}</h3>,
                      p: ({ children }) => <p className="mb-3 whitespace-normal">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3 ml-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3 ml-2">{children}</ol>,
                      li: ({ children }) => <li className="leading-snug">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                      em: ({ children }) => <em className="italic text-foreground/70">{children}</em>,
                      blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-foreground/70 italic">{children}</blockquote>,
                      hr: () => <hr className="my-3 border-border" />,
                    }}
                  >
                    {stripMentionHtml(aiSummary)}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            
            {/* Top Questions */}
            {questions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-yellow-500" />
                  Questions Asked ({questions.length})
                </h4>
                <div className="space-y-2">
                  {questions.slice(0, 5).map((q, i) => (
                    <div key={q.id || i} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="text-xs shrink-0">{q.speaker}</Badge>
                      <span className="text-muted-foreground">{stripMentionHtml(q.text)}</span>
                    </div>
                  ))}
                  {questions.length > 5 && (
                    <p className="text-xs text-muted-foreground">+{questions.length - 5} more questions</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Transcript Preview */}
            {transcript.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  Transcript ({transcript.length} entries)
                </h4>
                <ScrollArea className="h-32 rounded-md border bg-muted/30 p-3">
                  <div className="space-y-1.5 text-xs">
                    {transcript.slice(0, 20).map((entry, i) => (
                      <div key={i}>
                        <span className="font-medium text-primary">{entry.speaker}:</span>
                        <span className="text-muted-foreground ml-1">{stripMentionHtml(entry.text)}</span>
                      </div>
                    ))}
                    {transcript.length > 20 && (
                      <p className="text-muted-foreground pt-2">... and {transcript.length - 20} more</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// Unused helper component kept for potential future use
// function StatBadge({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
//   return (
//     <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
//       <Icon className="h-4 w-4 text-muted-foreground mb-1" />
//       <span className="text-sm font-semibold">{value}</span>
//       <span className="text-xs text-muted-foreground">{label}</span>
//     </div>
//   )
// }

export function HistoryPage() {
  const { meetingHistory, clearHistory } = useTabsStore()
  const setPage = useNavigationStore((s) => s.setPage)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  
  // Filter meetings by search query
  const filteredMeetings = useMemo(() => {
    if (!searchQuery.trim()) return meetingHistory
    const query = searchQuery.toLowerCase()
    return meetingHistory.filter(m => 
      m.title.toLowerCase().includes(query) ||
      m.summary?.aiSummary?.toLowerCase().includes(query) ||
      m.summary?.transcript.some(t => t.text.toLowerCase().includes(query))
    )
  }, [meetingHistory, searchQuery])
  
  // Export a single meeting summary
  const handleExport = useCallback((meeting: MeetingInfo) => {
    const exportData = {
      meeting: {
        title: meeting.title,
        url: meeting.meetingUrl,
        joinedAt: meeting.joinedAt,
        leftAt: meeting.leftAt,
        duration: meeting.duration
      },
      summary: meeting.summary
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meeting-${meeting.title.replace(/\s+/g, '-')}-${formatDate(meeting.joinedAt)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])
  
  // Clear all history
  const handleClearAll = useCallback(() => {
    if (confirmClear) {
      clearHistory()
      setConfirmClear(false)
    } else {
      setConfirmClear(true)
      // Reset after 3 seconds
      setTimeout(() => setConfirmClear(false), 3000)
    }
  }, [confirmClear, clearHistory])
  
  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
            <HistoryIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Meeting History</h1>
            <p className="text-sm text-muted-foreground">
              {meetingHistory.length} meeting{meetingHistory.length !== 1 ? 's' : ''} saved
            </p>
          </div>
        </div>
        
        {meetingHistory.length > 0 && (
          <Button 
            variant={confirmClear ? "destructive" : "outline"} 
            size="sm"
            onClick={handleClearAll}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {confirmClear ? "Confirm Clear All" : "Clear History"}
          </Button>
        )}
      </div>
      
      {/* Search */}
      {meetingHistory.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search meetings, summaries, transcripts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}
      
      {/* Meeting List */}
      <ScrollArea className="flex-1 -mx-2 px-2">
        {filteredMeetings.length > 0 ? (
          <div className="space-y-3 pb-4">
            {filteredMeetings.map((meeting) => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                onExport={() => handleExport(meeting)}
              />
            ))}
          </div>
        ) : meetingHistory.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No matches found</h3>
            <p className="text-sm text-muted-foreground">
              Try a different search term
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HistoryIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No meeting history yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Join a meeting to start building your history
            </p>
            <Button onClick={() => setPage('home')}>
              Go to Home
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
