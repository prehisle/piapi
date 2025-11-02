"use client"

import { useProviders } from "@/hooks/use-providers"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Trash2, Plus } from "lucide-react"
import { useState, useEffect } from "react"

export default function EditProviderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const providerName = searchParams.get("name") || ""
  const { providers, updateProvider } = useProviders()

  const [provider, setProvider] = useState({ name: "", api_keys: [], services: [] })
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyValue, setNewKeyValue] = useState("")
  const [newService, setNewService] = useState("")

  useEffect(() => {
    const found = providers.find((p) => p.name === providerName)
    if (found) {
      setProvider(found)
    }
  }, [providers, providerName])

  const handleAddKey = () => {
    if (newKeyName.trim() && newKeyValue.trim()) {
      setProvider((prev) => ({
        ...prev,
        api_keys: [...prev.api_keys, { name: newKeyName, value: newKeyValue }],
      }))
      setNewKeyName("")
      setNewKeyValue("")
    }
  }

  const handleRemoveKey = (index: number) => {
    setProvider((prev) => ({
      ...prev,
      api_keys: prev.api_keys.filter((_, i) => i !== index),
    }))
  }

  const handleAddService = () => {
    if (newService.trim() && !provider.services.includes(newService)) {
      setProvider((prev) => ({
        ...prev,
        services: [...prev.services, newService],
      }))
      setNewService("")
    }
  }

  const handleRemoveService = (index: number) => {
    setProvider((prev) => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index),
    }))
  }

  const handleSave = () => {
    updateProvider(providerName, provider)
    router.push("/admin/providers")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.push("/admin/providers")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">Edit Provider: {provider.name}</h1>
      </div>

      {/* API Keys Section */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Manage API keys for this provider</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {provider.api_keys.map((key, idx) => (
              <div key={idx} className="flex items-center justify-between bg-secondary/50 px-4 py-3 rounded-sm gap-4">
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Key Name</p>
                    <p className="font-mono text-sm font-medium">{key.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Key Value</p>
                    <p className="font-mono text-sm">{key.value}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveKey(idx)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-3 pt-2 border-t">
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name (e.g., api_key)"
              />
              <Input value={newKeyValue} onChange={(e) => setNewKeyValue(e.target.value)} placeholder="Key value" />
            </div>
            <Button onClick={handleAddKey} className="w-full gap-2">
              <Plus className="w-4 h-4" />
              Add API Key
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Services Section */}
      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
          <CardDescription>Select services provided by this provider</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {provider.services.map((service, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-2 rounded-sm">
                <span className="text-sm font-medium">{service}</span>
                <button onClick={() => handleRemoveService(idx)} className="hover:opacity-70">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              placeholder="e.g., llm, payment"
            />
            <Button onClick={handleAddService} className="gap-2">
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/admin/providers")}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>
    </div>
  )
}
