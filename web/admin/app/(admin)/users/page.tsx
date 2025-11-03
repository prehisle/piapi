"use client"

import { useUsers } from "@/hooks/use-users"
import { UsersTable } from "@/components/users/users-table"
import { useProviders } from "@/hooks/use-providers"

export default function UsersPage() {
  const { users, addUser, updateUser, deleteUser } = useUsers()
  const { providers } = useProviders()

  return (
    <div className="space-y-6">
      <UsersTable
        users={users}
        providers={providers}
        onAdd={addUser}
        onUpdate={updateUser}
        onDelete={deleteUser}
      />
    </div>
  )
}
