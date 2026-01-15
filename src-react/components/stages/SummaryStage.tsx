import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useCallStore } from '@/stores/callStore'
import { useCallAnalytics } from '@/hooks/useCallAnalytics'
import type { CallStats, CallAnalytics, TopQuestion } from '@/services'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { 
  Download, Clock, Users, MessageSquare, 
  HelpCircle, Bot, ChevronDown, ChevronRight,
  Loader2, X, RotateCcw
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'

// Helper to strip HTML mention tags from Teams chat messages while preserving markdown-friendly newlines
function stripMentionHtml(text: string): string {
  let cleaned = text

  // Normalize common block boundaries to newlines so markdown headings keep their structure
  cleaned = cleaned.replace(/<\/?p[^>]*>/gi, '\n')
  cleaned = cleaned.replace(/<br\s*\/?\s*>/gi, '\n')

  // Replace Teams mention spans with the @name text
  cleaned = cleaned.replace(/<span[^>]*itemtype="http:\/\/schema\.skype\.com\/Mention"[^>]*>([^<]+)<\/span>/gi, '@$1')

  // Drop any remaining tags
  cleaned = cleaned.replace(/<[^>]+>/g, '')

  // Tidy whitespace but keep deliberate paragraph breaks
  cleaned = cleaned.replace(/[ \t]+/g, ' ')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = cleaned.trim()

  return cleaned
}

interface SummaryStageProps {
  onRejoin?: () => void
  onClose?: () => void
}

export function SummaryStage({ onRejoin, onClose }: SummaryStageProps) {
  const setStage = useAppStore((state) => state.setStage)
  const { captions: storeCaptions, callStartTime, participants } = useCallStore()
  
  // Real hook - use analytics service data
  const { getStats, getAnalytics, getTopQuestions, getCaptions } = useCallAnalytics()
  
  // Local state for results
  const [stats, setStats] = useState<CallStats | null>(null)
  const [analytics, setAnalytics] = useState<CallAnalytics | null>(null)
  const [topQuestions, setTopQuestions] = useState<TopQuestion[]>([])
  const [analyticsCaptions, setAnalyticsCaptions] = useState<Array<{ speaker: string; text: string; timestamp: Date }>>([])
  const [isLoading, setIsLoading] = useState(true)
  
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false)

  // Fetch analytics on mount
  useEffect(() => {
    const loadAnalytics = async () => {
      setIsLoading(true)
      try {
        const statsResult = getStats()
        setStats(statsResult)
        
        const analyticsResult = await getAnalytics()
        setAnalytics(analyticsResult)
        
        // Get top questions from analytics service
        const questionsResult = getTopQuestions(5)
        setTopQuestions(questionsResult)
        
        // Get captions from analytics service (persisted even after call ends)
        const captionsResult = getCaptions()
        setAnalyticsCaptions(captionsResult)
      } catch (error) {
        console.error('Failed to load analytics:', error)
      }
      setIsLoading(false)
    }
    loadAnalytics()
  }, [getStats, getAnalytics, getTopQuestions, getCaptions])
  
  // Use analytics captions if available, otherwise fall back to store captions
  const displayCaptions = analyticsCaptions.length > 0 ? analyticsCaptions : storeCaptions

  // Calculate stats locally as fallback
  const duration = callStartTime 
    ? Math.floor((Date.now() - callStartTime.getTime()) / 1000)
    : 0
  
  // Format duration nicely (e.g., "1:29" for 89 seconds)
  const formatDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins}:${secs.toString().padStart(2, '0')}`
    } else {
      const hours = Math.floor(seconds / 3600)
      const mins = Math.floor((seconds % 3600) / 60)
      const secs = seconds % 60
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
  }

  const handleNewCall = useCallback(() => {
    if (onRejoin) {
      onRejoin()
    } else {
      setStage('connect')
    }
  }, [setStage, onRejoin])

  const handleExport = useCallback(() => {
    // Export analytics as comprehensive CSV with multiple sheets in one file
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
    
    // Build CSV content with multiple sections
    // Start with BOM for proper UTF-8 encoding in Excel
    let csvContent = '\uFEFF'
    
    // Section 1: Call Summary
    csvContent += 'CALL SUMMARY\n'
    csvContent += `Export Date,${new Date().toLocaleString()}\n`
    csvContent += `Duration,${formatDuration(stats?.totalDuration || duration)}\n`
    csvContent += `Participants,${analytics?.stats?.participants || participants.length}\n`
    csvContent += `Total Exchanges,${stats?.totalCaptions || displayCaptions.length}\n`
    csvContent += `Questions Asked,${stats?.totalQuestions || topQuestions.length}\n`
    csvContent += `Agent Responses,${stats?.totalResponses || 0}\n`
    csvContent += '\n'
    
    // Section 2: Participant List
    csvContent += 'PARTICIPANTS\n'
    csvContent += 'Name,Message Count\n'
    // participantList from analytics is an array of speaker names (strings)
    const participantList: string[] = analytics?.stats?.participantList || []
    // Count messages per participant from captions
    const participantCounts = new Map<string, number>()
    displayCaptions.forEach(c => {
      const speaker = c.speaker || 'Unknown'
      participantCounts.set(speaker, (participantCounts.get(speaker) || 0) + 1)
    })
    if (participantList.length > 0) {
      participantList.forEach((name: string) => {
        const count = participantCounts.get(name) || 0
        csvContent += `"${name}",${count}\n`
      })
    } else if (participantCounts.size > 0) {
      participantCounts.forEach((count, name) => {
        csvContent += `"${name}",${count}\n`
      })
    } else {
      participants.forEach(p => {
        csvContent += `"${p.displayName || 'Unknown'}",0\n`
      })
    }
    csvContent += '\n'
    
    // Section 3: Top Questions
    csvContent += 'TOP QUESTIONS\n'
    csvContent += 'Question,Asked By,Response Time,Number\n'
    topQuestions.forEach((q) => {
      const question = (q.text || '').replace(/"/g, '""')
      const askedBy = (q.speaker || 'Unknown').replace(/"/g, '""')
      const responseTime = (q.responseTime || 'N/A').replace(/"/g, '""')
      csvContent += `"${question}","${askedBy}","${responseTime}","${q.number}"\n`
    })
    csvContent += '\n'
    
    // Section 4: AI-Generated Summary
    if (analytics?.summary && typeof analytics.summary === 'string') {
      csvContent += 'AI-GENERATED SUMMARY\n'
      csvContent += 'Section,Content\n'
      csvContent += `"Summary","${(analytics.summary || '').replace(/"/g, '""')}"\n`
      csvContent += '\n'
    }
    
    // Section 5: Full Transcript
    csvContent += 'FULL TRANSCRIPT\n'
    csvContent += 'Timestamp,Speaker,Message\n'
    displayCaptions.forEach((caption) => {
      const time = caption.timestamp.toLocaleTimeString()
      const speaker = (caption.speaker || 'Unknown').replace(/"/g, '""')
      const text = stripMentionHtml(caption.text || '').replace(/"/g, '""').replace(/\n/g, ' ')
      csvContent += `"${time}","${speaker}","${text}"\n`
    })
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `call-summary-${timestamp}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [stats, analytics, displayCaptions, topQuestions, duration, participants])

  // Use analytics service data which tracks participants from captions
  const participantList = analytics?.stats?.participantList || []
  const participantCount = analytics?.stats?.participants || stats?.participantCount || participants.length
  
  // Use real stats if available, otherwise fallback (aligned with history cards; avg response removed)
  const displayStats = [
    { icon: Clock, label: 'Duration', value: formatDuration(stats?.totalDuration || duration), color: 'text-primary' },
    { icon: Users, label: 'Participants', value: participantCount.toString(), color: 'text-success' },
    { icon: MessageSquare, label: 'Exchanges', value: (stats?.totalCaptions || displayCaptions.length).toString(), color: 'text-blue-400' },
    { icon: HelpCircle, label: 'Questions Asked', value: (stats?.totalQuestions || topQuestions.length).toString(), color: 'text-yellow-400' },
    { icon: Bot, label: 'Agent Responses', value: (stats?.totalResponses || 0).toString(), color: 'text-purple-400' },
  ]

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              📊
            </div>
            <h2 className="text-2xl font-bold">Call Summary</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
            <Button variant="default" onClick={handleNewCall}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Rejoin
            </Button>
            {onClose && (
              <Button variant="outline" onClick={onClose}>
                <X className="w-4 h-4 mr-2" />
                Close Tab
              </Button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {displayStats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 text-center">
                <stat.icon className={cn("w-8 h-8 mx-auto mb-2", stat.color)} />
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* AI Summary - Takes 2 columns */}
          <Card className="md:col-span-2 bg-primary/5 border-primary/20 min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                AI-Generated Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              <div className="text-sm leading-relaxed space-y-3 min-w-0">
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating AI summary...
                  </div>
                ) : analytics?.summary ? (
                  <ReactMarkdown
                    components={{
                      h2: ({ children }) => <h2 className="text-lg font-semibold mt-4 mb-3 first:mt-0">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-semibold mt-4 mb-2 text-foreground">{children}</h3>,
                      p: ({ children }) => <p className="text-sm leading-relaxed mb-3 whitespace-normal">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside space-y-1.5 text-sm mb-3 ml-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside space-y-1.5 text-sm mb-3 ml-2">{children}</ol>,
                      li: ({ children }) => <li className="text-sm">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                      em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
                      blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-sm italic text-muted-foreground">{children}</blockquote>,
                      hr: () => <hr className="my-4 border-border" />,
                      table: ({ children }) => <table className="w-full text-sm my-3 border-collapse">{children}</table>,
                      thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                      tbody: ({ children }) => <tbody>{children}</tbody>,
                      tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
                      th: ({ children }) => <th className="text-left p-2 font-medium">{children}</th>,
                      td: ({ children }) => <td className="p-2">{children}</td>,
                    }}
                  >
                    {stripMentionHtml(analytics.summary)}
                  </ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground">
                    No summary available. Make sure OpenAI API key is configured.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Questions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-yellow-500" />
                Top Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No questions recorded</p>
              ) : (
                <ul className="space-y-3">
                  {topQuestions.map((q) => (
                    <li key={q.number} className="text-sm">
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="shrink-0">
                          {q.number}
                        </Badge>
                        <div>
                          <p className="font-medium">{stripMentionHtml(q.text)}</p>
                          <p className="text-xs text-muted-foreground">
                            Asked by {q.speaker} • Response: {q.responseTime}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Participants */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              👥 Participants
            </CardTitle>
          </CardHeader>
          <CardContent>
            {participantList.length === 0 && participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No participants recorded</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(participantList.length > 0 ? participantList : participants.map(p => p.displayName)).map((name, idx) => (
                  <Badge key={idx} variant="secondary">
                    {name}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transcript (Collapsible) */}
        <Card>
          <CardHeader 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
          >
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                📝 Full Transcript
              </span>
              {isTranscriptExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </CardTitle>
          </CardHeader>
          {isTranscriptExpanded && (
            <CardContent>
              <ScrollArea className="h-64">
                {displayCaptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transcript available</p>
                ) : (
                  <div className="space-y-2 font-mono text-sm">
                    {displayCaptions.map((caption, idx) => (
                      <div key={idx}>
                        <span className="text-primary font-semibold">
                          {caption.speaker}:
                        </span>{' '}
                        <span className="text-muted-foreground">
                          {caption.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
