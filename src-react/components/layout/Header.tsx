import { StageIndicator } from './StageIndicator'
import { ConnectionBadge } from './ConnectionBadge'
// import { Bot } from 'lucide-react' // Unused

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 shadow-md ring-2 ring-black/20 dark:ring-black/40">
          <span className="text-xs font-bold text-gray-900">CAB</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl text-amber-500 dark:text-amber-400" style={{ fontFamily: "'Dancing Script', cursive", fontWeight: 600 }}>Community</span>
          <span className="text-lg font-bold text-foreground italic tracking-wider">AGENT BRIDGE</span>
        </div>
      </div>

      {/* Center: Stage Indicator */}
      <StageIndicator />

      {/* Right: Connection Status */}
      <div className="flex items-center gap-4">
        <ConnectionBadge />
      </div>
    </header>
  )
}
