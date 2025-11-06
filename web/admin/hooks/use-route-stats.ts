"use client"

import useSWR from "swr"
import { apiClient, type CandidateRuntimeStatus } from "@/lib/api"

export function useRouteStats(apiKey?: string, serviceType?: string) {
  const key = apiKey && serviceType ? ["route-stats", apiKey, serviceType] : null
  const { data, error, isLoading, mutate } = useSWR<CandidateRuntimeStatus[]>(
    key,
    () => apiClient.getRouteStats(apiKey!, serviceType!),
    {
      refreshInterval: 10000,
      revalidateOnFocus: false,
    }
  )

  return {
    stats: data ?? [],
    isLoading,
    error,
    mutate,
  }
}
