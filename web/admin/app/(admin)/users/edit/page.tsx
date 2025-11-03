"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useRoutingStrategies } from "@/hooks/use-routing-strategies"
import { useProviders } from "@/hooks/use-providers"
import { RoutingTable } from "@/components/routing/routing-table"
import { withBasePath } from "@/lib/base-path"

export default function EditUserPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const userName = searchParams.get("name") || ""

  const { strategies, addStrategy, updateStrategy, deleteStrategy } = useRoutingStrategies(userName)
  const { providers } = useProviders()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(withBasePath("/users"))}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">Edit User: {userName}</h1>
      </div>

      <RoutingTable
        strategies={strategies}
        providers={providers}
        onAdd={addStrategy}
        onUpdate={updateStrategy}
        onDelete={deleteStrategy}
      />
    </div>
  )
}
