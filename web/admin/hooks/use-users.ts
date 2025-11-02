"use client"

import { useState, useCallback } from "react"

export interface User {
  name: string
  api_key: string
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([
    { name: "user1", api_key: "sk_live_1234567890abcdef" },
    { name: "user2", api_key: "sk_live_0987654321fedcba" },
    { name: "user3", api_key: "sk_live_abcdefghijklmnop" },
  ])

  const addUser = useCallback((user: User) => {
    setUsers((prev) => [...prev, user])
  }, [])

  const deleteUser = useCallback((name: string) => {
    setUsers((prev) => prev.filter((u) => u.name !== name))
  }, [])

  return { users, addUser, deleteUser }
}
