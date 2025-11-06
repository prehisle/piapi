"use client"

import useSWR from "swr"
import { apiClient } from "@/lib/api"

export interface DashboardLogsFilters {
  provider?: string
  user?: string
  service?: string
  limit?: number
}

export function useDashboardLogs(filters?: DashboardLogsFilters, refreshInterval = 5000) {
  const { data, error, mutate, isLoading } = useSWR(
    ["dashboard-logs", filters],
    async () => {
      const response = await apiClient.getDashboardLogs(filters)
      return response.logs
    },
    {
      refreshInterval, // Auto-refresh every 5 seconds
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  )

  return {
    logs: data ?? [],
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
  }
}
