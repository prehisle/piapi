"use client"

import { useState, useCallback } from "react"

export interface RoutingStrategy {
  id: string
  service: string
  provider: string
  api_key: string
}

export function useRoutingStrategies(_userName: string) {
  const [strategies, setStrategies] = useState<RoutingStrategy[]>([
    { id: "1", service: "llm", provider: "Provider A", api_key: "key_123" },
    { id: "2", service: "payment", provider: "Provider B", api_key: "key_789" },
  ])

  const addStrategy = useCallback((strategy: Omit<RoutingStrategy, "id">) => {
    const newStrategy: RoutingStrategy = {
      ...strategy,
      id: Date.now().toString(),
    }
    setStrategies((prev) => [...prev, newStrategy])
  }, [])

  const updateStrategy = useCallback((id: string, strategy: Omit<RoutingStrategy, "id">) => {
    setStrategies((prev) => prev.map((s) => (s.id === id ? { ...s, ...strategy } : s)))
  }, [])

  const deleteStrategy = useCallback((id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id))
  }, [])

  return { strategies, addStrategy, updateStrategy, deleteStrategy }
}
