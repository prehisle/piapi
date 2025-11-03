"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { apiClient, type Provider as ApiProvider, type Service as ApiService } from "@/lib/api"

// Frontend representation with transformed API keys structure
export interface ApiKey {
  name: string
  value: string
}

export type ProviderServiceType = "claude_code" | "codex"

export interface ProviderService {
  type: ProviderServiceType
  base_url: string
}

export interface Provider {
  name: string
  api_keys: ApiKey[]
  services: ProviderService[]
}

// Transform backend Provider to frontend format
function transformProvider(apiProvider: ApiProvider): Provider {
  // Convert api_keys map to array
  const apiKeys: ApiKey[] = Object.entries(apiProvider.api_keys).map(([name, value]) => ({
    name,
    value,
  }))

  // Extract services with base URLs
  const services = (apiProvider.services || []).map((s: ApiService) => ({
    type: s.type as ProviderServiceType,
    base_url: s.base_url,
  }))

  return {
    name: apiProvider.name,
    api_keys: apiKeys,
    services,
  }
}

// Transform frontend Provider back to API format
function untransformProvider(provider: Provider): ApiProvider {
  // Convert api_keys array back to map
  const apiKeys: { [key: string]: string } = {}
  provider.api_keys.forEach((key) => {
    apiKeys[key.name] = key.value
  })

  // Convert service types to full service objects
  const services = provider.services.map((service) => ({
    type: service.type,
    base_url: service.base_url,
    auth: {
      mode: "header",
      name: "Authorization",
      prefix: "Bearer ",
    },
  }))

  return {
    name: provider.name,
    api_keys: apiKeys,
    services,
  }
}

export function useProviders() {
  const { data, error, mutate } = useSWR(
    "config",
    async () => {
      const config = await apiClient.getConfig()
      // Handle null providers from empty config
      const providers = config.providers || []
      return providers.map(transformProvider)
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  const providers = data || []
  const isLoading = !error && !data
  const isError = error

  const addProvider = useCallback(
    async (provider: Provider) => {
      try {
        // Optimistic update
        mutate([...providers, provider], false)

        // Call API
        await apiClient.addProvider(untransformProvider(provider))

        // Revalidate
        mutate()
      } catch (err) {
        console.error("Failed to add provider:", err)
        // Revert on error
        mutate()
        throw err
      }
    },
    [providers, mutate]
  )

  const updateProvider = useCallback(
    async (name: string, provider: Provider) => {
      try {
        // Optimistic update
        const updated = providers.map((p) => (p.name === name ? provider : p))
        mutate(updated, false)

        // Call API
        await apiClient.updateProvider(name, untransformProvider(provider))

        // Revalidate
        mutate()
      } catch (err) {
        console.error("Failed to update provider:", err)
        // Revert on error
        mutate()
        throw err
      }
    },
    [providers, mutate]
  )

  const deleteProvider = useCallback(
    async (name: string) => {
      try {
        // Optimistic update
        const filtered = providers.filter((p) => p.name !== name)
        mutate(filtered, false)

        // Call API
        await apiClient.deleteProvider(name)

        // Revalidate
        mutate()
      } catch (err) {
        console.error("Failed to delete provider:", err)
        // Revert on error
        mutate()
        throw err
      }
    },
    [providers, mutate]
  )

  return {
    providers,
    isLoading,
    isError,
    addProvider,
    updateProvider,
    deleteProvider,
  }
}
