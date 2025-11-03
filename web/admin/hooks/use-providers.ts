"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { apiClient, type Provider as ApiProvider } from "@/lib/api"

// Frontend representation with transformed API keys structure
export interface ApiKey {
  name: string
  value: string
}

export interface Provider {
  name: string
  api_keys: ApiKey[]
  services: string[]
}

// Transform backend Provider to frontend format
function transformProvider(apiProvider: ApiProvider): Provider {
  // Convert api_keys map to array
  const apiKeys: ApiKey[] = Object.entries(apiProvider.api_keys).map(([name, value]) => ({
    name,
    value,
  }))

  // Extract service types
  const services = apiProvider.services.map((s) => s.type)

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
  // For now, we create minimal service configs with empty base_url
  // These can be edited later to add the full configuration
  const services = provider.services.map((type) => ({
    type,
    base_url: `https://example.com/${type}/v1`, // Placeholder URL
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
    "/admin/api/config",
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
