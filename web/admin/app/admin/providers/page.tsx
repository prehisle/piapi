"use client"

import { useProviders } from "@/hooks/use-providers"
import { ProvidersList } from "@/components/providers/providers-list"

export default function ProvidersPage() {
  const { providers, addProvider, deleteProvider } = useProviders()

  return (
    <div className="space-y-6">
      <ProvidersList providers={providers} onAdd={addProvider} onDelete={deleteProvider} />
    </div>
  )
}
