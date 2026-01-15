import { useAppStore } from '@/stores/appStore'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ConnectionStatus } from '@/types'

const statusConfig: Record<ConnectionStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  disconnected: { label: 'Disconnected', variant: 'secondary' },
  connecting: { label: 'Connecting...', variant: 'warning' },
  connected: { label: 'Connected', variant: 'success' },
  'in-lobby': { label: 'In Lobby', variant: 'warning' },
  error: { label: 'Error', variant: 'destructive' },
}

export function ConnectionBadge() {
  const status = useAppStore((state) => state.connectionStatus)
  const config = statusConfig[status]

  return (
    <Badge variant={config.variant} className="gap-1.5">
      <span
        className={cn(
          'w-2 h-2 rounded-full',
          status === 'connected' && 'bg-green-400 animate-pulse',
          status === 'connecting' && 'bg-yellow-400 animate-pulse',
          status === 'in-lobby' && 'bg-yellow-400 animate-pulse',
          status === 'disconnected' && 'bg-gray-400',
          status === 'error' && 'bg-red-400'
        )}
      />
      {config.label}
    </Badge>
  )
}
