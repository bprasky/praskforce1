'use client'
import Link from 'next/link'
import { HEALTH_INFO } from '@/lib/task-tree-stats'

/**
 * Compact badge for Pipeline deal cards. Shows tree health status +
 * task counts and links to /tasks?deal=<id> for drill-down.
 *
 * Usage:
 *   <TreeHealthBadge
 *     dealId="..."
 *     health={stats.health}
 *     totalTasks={stats.totalTasks}
 *     openTasks={stats.openTasks}
 *   />
 */
export default function TreeHealthBadge({ dealId, health = 'empty', totalTasks = 0, openTasks = 0 }) {
  const info = HEALTH_INFO[health] || HEALTH_INFO.empty
  const href = dealId ? `/tasks?view=tree&deal=${encodeURIComponent(dealId)}` : '/tasks?view=tree'

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded border ${info.bg} ${info.color} ${info.border} hover:opacity-80 transition-opacity`}
      title={`Tree health: ${info.label}. Click to view tree.`}
    >
      <span>{info.icon}</span>
      <span>{info.label}</span>
      {totalTasks > 0 && (
        <span className="opacity-70">
          · {totalTasks} tasks{openTasks > 0 ? ` (${openTasks} open)` : ''}
        </span>
      )}
    </Link>
  )
}
