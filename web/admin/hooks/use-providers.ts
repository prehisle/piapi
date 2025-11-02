"use client"

import { useState, useCallback } from "react"

export interface ApiKey {
  name: string
  value: string
}

export interface Provider {
  name: string
  api_keys: ApiKey[]
  services: string[]
}

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([
    {
      name: "Provider A",
      api_keys: [
        { name: "api_key", value: "key_123" },
        { name: "secret_key", value: "key_456" },
      ],
      services: ["llm", "payment"],
    },
    {
      name: "Provider B",
      api_keys: [{ name: "api_key", value: "key_789" }],
      services: ["llm"],
    },
  ])

  const addProvider = useCallback((provider: Provider) => {
    setProviders((prev) => [...prev, provider])
  }, [])

  const updateProvider = useCallback((name: string, provider: Provider) => {
    setProviders((prev) => prev.map((p) => (p.name === name ? provider : p)))
  }, [])

  const deleteProvider = useCallback((name: string) => {
    setProviders((prev) => prev.filter((p) => p.name !== name))
  }, [])

  return { providers, addProvider, updateProvider, deleteProvider }
}
