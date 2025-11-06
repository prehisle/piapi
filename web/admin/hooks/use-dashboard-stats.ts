"use client"

import useSWR from "swr"
import { apiClient, type DashboardStats } from "@/lib/api"

export function useDashboardStats(refreshInterval = 5000) {
  const { data, error, mutate, isLoading } = useSWR(
    "dashboard-stats",
    async () => {
      return await apiClient.getDashboardStats()
    },
    {
      refreshInterval, // Auto-refresh every 5 seconds
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  )

  return {
    stats: data,
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
  }
}
