"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDashboardStats } from "@/hooks/use-dashboard-stats"
import { useDashboardLogs } from "@/hooks/use-dashboard-logs"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { StatsDimensionSelector } from "@/components/dashboard/stats-dimension-selector"
import { LogsTable } from "@/components/dashboard/logs-table"
import { LogsFilters } from "@/components/dashboard/logs-filters"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardPage() {
  const [logFilters, setLogFilters] = useState<{
    provider?: string
    user?: string
    service?: string
  }>({})

  const [statsDimension, setStatsDimension] = useState<{
    provider?: string
    user?: string
    service?: string
  }>({})

  const { stats, isLoading: statsLoading, refresh: refreshStats } = useDashboardStats(5000)
  const { logs, isLoading: logsLoading, refresh: refreshLogs } = useDashboardLogs(
    { ...logFilters, limit: 100 },
    5000
  )

  const handleRefresh = () => {
    refreshStats()
    refreshLogs()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            实时调用日志和统计数据（自动每5秒刷新）
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={statsLoading || logsLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${statsLoading || logsLoading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      {/* Statistics with Dimension Selector */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>统计维度</CardTitle>
          <div className="flex-1 ml-8">
            <StatsDimensionSelector
              providers={stats?.providers ?? []}
              users={stats?.users ?? []}
              serviceTypes={stats?.service_types ?? []}
              selectedProvider={statsDimension.provider}
              selectedUser={statsDimension.user}
              selectedService={statsDimension.service}
              onProviderChange={(provider) => setStatsDimension({ ...statsDimension, provider })}
              onUserChange={(user) => setStatsDimension({ ...statsDimension, user })}
              onServiceChange={(service) => setStatsDimension({ ...statsDimension, service })}
            />
          </div>
        </CardHeader>
        <CardContent>
          <StatsCards
            stats={stats}
            isLoading={statsLoading}
            selectedProvider={statsDimension.provider}
            selectedUser={statsDimension.user}
            selectedService={statsDimension.service}
          />
        </CardContent>
      </Card>

      {/* Logs Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>调用日志</CardTitle>
          <div className="flex-1 ml-8">
            <LogsFilters
              providers={stats?.providers ?? []}
              users={stats?.users ?? []}
              serviceTypes={stats?.service_types ?? []}
              filters={logFilters}
              onFiltersChange={setLogFilters}
            />
          </div>
        </CardHeader>
        <CardContent>
          <LogsTable logs={logs} isLoading={logsLoading} />
        </CardContent>
      </Card>
    </div>
  )
}
