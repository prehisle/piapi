"use client"

import { useCallback, useMemo } from "react"
import useSWR from "swr"
import { apiClient, type User as ApiUser, type UserServiceRoute as ApiUserServiceRoute, type UserServiceCandidate as ApiUserServiceCandidate } from "@/lib/api"

export interface UserServiceCandidate {
  provider_name: string
  provider_key_name: string
  weight?: number
  enabled?: boolean
  tags?: string[]
}

export interface UserServiceRoute {
  provider_name?: string
  provider_key_name?: string
  strategy?: string
  candidates?: UserServiceCandidate[]
}

export interface User {
  name: string
  api_key: string
  services: {
    [serviceType: string]: UserServiceRoute
  }
}

function transformCandidate(candidate: ApiUserServiceCandidate): UserServiceCandidate {
  return {
    provider_name: candidate.provider_name,
    provider_key_name: candidate.provider_key_name,
    weight: candidate.weight ?? 1,
    enabled: candidate.enabled ?? true,
    tags: candidate.tags ?? [],
  }
}

function transformRoute(route: ApiUserServiceRoute): UserServiceRoute {
  if (!route) {
    return {}
  }
  const candidates = route.candidates?.map(transformCandidate)
  return {
    provider_name: route.provider_name,
    provider_key_name: route.provider_key_name,
    strategy: route.strategy,
    candidates,
  }
}

function transformUser(apiUser: ApiUser): User {
  const services: Record<string, UserServiceRoute> = {}
  const sourceServices = apiUser.services ?? {}
  for (const [service, route] of Object.entries(sourceServices)) {
    services[service] = transformRoute(route)
  }
  return {
    name: apiUser.name,
    api_key: apiUser.api_key,
    services,
  }
}

function prepareCandidate(candidate: UserServiceCandidate): ApiUserServiceCandidate {
  return {
    provider_name: candidate.provider_name,
    provider_key_name: candidate.provider_key_name,
    weight: candidate.weight,
    enabled: candidate.enabled,
    tags: candidate.tags,
  }
}

function untransformRoute(route: UserServiceRoute): ApiUserServiceRoute {
  const candidates = route.candidates?.map(prepareCandidate)
  return {
    provider_name: route.provider_name,
    provider_key_name: route.provider_key_name,
    strategy: route.strategy,
    candidates,
  }
}

function untransformUser(user: User): ApiUser {
  const services: Record<string, ApiUserServiceRoute> = {}
  for (const [service, route] of Object.entries(user.services ?? {})) {
    services[service] = untransformRoute(route)
  }
  return {
    name: user.name,
    api_key: user.api_key,
    services,
  }
}

export function useUsers() {
  const { data, error, mutate } = useSWR(
    "config/users",
    async () => {
      const config = await apiClient.getConfig()
      const users = config.users || []
      return users.map(transformUser)
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  const users = useMemo(() => data ?? [], [data])
  const isLoading = !error && !data
  const isError = error

  const addUser = useCallback(
    async (user: User) => {
      try {
        mutate([...users, user], false)
        await apiClient.addUser(untransformUser(user))
        mutate()
      } catch (err) {
        console.error("Failed to add user:", err)
        mutate()
        throw err
      }
    },
    [users, mutate]
  )

  const updateUser = useCallback(
    async (name: string, user: User) => {
      try {
        const updated = users.map((u) => (u.name === name ? user : u))
        mutate(updated, false)
        await apiClient.updateUser(name, untransformUser(user))
        mutate()
      } catch (err) {
        console.error("Failed to update user:", err)
        mutate()
        throw err
      }
    },
    [users, mutate]
  )

  const deleteUser = useCallback(
    async (name: string) => {
      try {
        const filtered = users.filter((u) => u.name !== name)
        mutate(filtered, false)
        await apiClient.deleteUser(name)
        mutate()
      } catch (err) {
        console.error("Failed to delete user:", err)
        mutate()
        throw err
      }
    },
    [users, mutate]
  )

  return {
    users,
    isLoading,
    isError,
    addUser,
    updateUser,
    deleteUser,
  }
}
