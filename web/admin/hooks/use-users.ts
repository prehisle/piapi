"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { apiClient, type User as ApiUser } from "@/lib/api"

export interface UserServiceRoute {
  provider_name: string
  provider_key_name: string
}

export interface User {
  name: string
  api_key: string
  services: {
    [serviceType: string]: UserServiceRoute
  }
}

function transformUser(apiUser: ApiUser): User {
  return {
    name: apiUser.name,
    api_key: apiUser.api_key,
    services: apiUser.services ?? {},
  }
}

function untransformUser(user: User): ApiUser {
  return {
    name: user.name,
    api_key: user.api_key,
    services: user.services ?? {},
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

  const users = data || []
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
