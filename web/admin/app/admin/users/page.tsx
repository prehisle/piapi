"use client"

import { useUsers } from "@/hooks/use-users"
import { UsersTable } from "@/components/users/users-table"

export default function UsersPage() {
  const { users, addUser, deleteUser } = useUsers()

  return (
    <div className="space-y-6">
      <UsersTable users={users} onAdd={addUser} onDelete={deleteUser} />
    </div>
  )
}
