import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import type { AppStage } from '@/types'

const stages: { id: AppStage; label: string; number: number }[] = [
  { id: 'setup', label: 'Setup', number: 1 },
  { id: 'connect', label: 'Connect', number: 2 },
  { id: 'meeting', label: 'In Meeting', number: 3 },
  { id: 'summary', label: 'Summary', number: 4 },
]

export function StageIndicator() {
  const currentStage = useAppStore((state) => state.stage)
  
  const getStageIndex = (stage: AppStage) => stages.findIndex((s) => s.id === stage)
  const currentIndex = getStageIndex(currentStage)

  return (
    <div className="flex items-center gap-2">
      {stages.map((stage, index) => (
        <div key={stage.id} className="flex items-center">
          {/* Stage Step */}
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors',
              index === currentIndex && 'bg-primary text-primary-foreground',
              index < currentIndex && 'bg-success/20 text-success',
              index > currentIndex && 'bg-muted text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full',
                index === currentIndex && 'bg-primary-foreground/20',
                index < currentIndex && 'bg-success/30',
                index > currentIndex && 'bg-muted-foreground/20'
              )}
            >
              {index < currentIndex ? '✓' : stage.number}
            </span>
            <span className="text-sm font-medium hidden sm:inline">
              {stage.label}
            </span>
          </div>

          {/* Connector */}
          {index < stages.length - 1 && (
            <div
              className={cn(
                'w-8 h-0.5 mx-1',
                index < currentIndex ? 'bg-success' : 'bg-muted'
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
