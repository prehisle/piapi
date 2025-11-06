"use client"

import { Activity, CheckCircle2, XCircle, Clock } from "lucide-react"
import type { DashboardStats } from "@/lib/api"

interface StatsCardsProps {
  stats?: DashboardStats
  isLoading: boolean
  selectedProvider?: string
  selectedUser?: string
  selectedService?: string
}

export function StatsCards({
  stats,
  isLoading,
  selectedProvider,
  selectedUser,
  selectedService,
}: StatsCardsProps) {
  // Calculate filtered stats based on selected dimensions
  const getFilteredStats = () => {
    if (!stats?.request_stats) {
      return {
        total_requests: 0,
        success_rate: 0,
        success_count: 0,
        error_count: 0,
        avg_latency_ms: 0,
      }
    }

    const rs = stats.request_stats

    // If all filters are "all", return overall stats
    if (!selectedProvider && !selectedUser && !selectedService) {
      return {
        total_requests: rs.total_requests ?? 0,
        success_rate: rs.success_rate ?? 0,
        success_count: rs.success_count ?? 0,
        error_count: rs.error_count ?? 0,
        avg_latency_ms: rs.avg_latency_ms ?? 0,
      }
    }

    // Get stats for selected dimension
    let dimensionStats = null
    if (selectedProvider && rs.by_provider?.[selectedProvider]) {
      dimensionStats = rs.by_provider[selectedProvider]
    } else if (selectedUser && rs.by_user?.[selectedUser]) {
      dimensionStats = rs.by_user[selectedUser]
    } else if (selectedService && rs.by_service?.[selectedService]) {
      dimensionStats = rs.by_service[selectedService]
    }

    if (!dimensionStats) {
      return {
        total_requests: 0,
        success_rate: 0,
        success_count: 0,
        error_count: 0,
        avg_latency_ms: 0,
      }
    }

    const total = dimensionStats.total || 0
    const success = dimensionStats.success || 0
    const error = dimensionStats.error || 0
    const successRate = total > 0 ? (success / total) * 100 : 0

    return {
      total_requests: total,
      success_rate: successRate,
      success_count: success,
      error_count: error,
      avg_latency_ms: 0, // Dimension stats don't have latency data
    }
  }

  const requestStats = getFilteredStats()

  const statItems = [
    {
      title: "总请求数",
      value: requestStats.total_requests,
      icon: Activity,
      description: "当前会话",
    },
    {
      title: "成功率",
      value: `${requestStats.success_rate.toFixed(1)}%`,
      icon: CheckCircle2,
      description: `成功 ${requestStats.success_count} 次`,
      color: "text-green-600",
    },
    {
      title: "错误数",
      value: requestStats.error_count,
      icon: XCircle,
      description: "失败请求",
      color: "text-red-600",
    },
    {
      title: "平均延迟",
      value: `${Math.round(requestStats.avg_latency_ms)}ms`,
      icon: Clock,
      description: "响应时间",
    },
  ]

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            <div className="h-3 w-20 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {statItems.map((item) => {
        const Icon = item.icon
        return (
          <div key={item.title} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{item.title}</p>
              <Icon className={`h-4 w-4 ${item.color ?? "text-muted-foreground"}`} />
            </div>
            <div className={`text-2xl font-bold ${item.color ?? ""}`}>{item.value}</div>
            <p className="text-xs text-muted-foreground">{item.description}</p>
          </div>
        )
      })}
    </div>
  )
}
