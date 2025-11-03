"use client"

import { useProviders } from "@/hooks/use-providers"
import type { Provider, ProviderServiceType } from "@/hooks/use-providers"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Trash2, Plus } from "lucide-react"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

const SERVICE_OPTIONS: ProviderServiceType[] = ["claude_code", "codex"]

interface ProviderFormService {
  type: ProviderServiceType | ""
  base_url: string
}

interface ServiceFieldError {
  type?: string
  base_url?: string
}

type ProviderFormData = Omit<Provider, "services"> & {
  services: ProviderFormService[]
}

export default function EditProviderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const providerName = searchParams.get("name") || ""
  const { providers, updateProvider } = useProviders()

  const [provider, setProvider] = useState<ProviderFormData>({ name: "", api_keys: [], services: [] })
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyValue, setNewKeyValue] = useState("")
  const [errors, setErrors] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [serviceFieldErrors, setServiceFieldErrors] = useState<ServiceFieldError[]>([])

  useEffect(() => {
    const found = providers.find((p) => p.name === providerName)
    if (found) {
      setProvider({
        name: found.name,
        api_keys: found.api_keys.map((key) => ({ ...key })),
        services: found.services.map((service) => ({
          type: service.type,
          base_url: service.base_url,
        })),
      })
      setServiceFieldErrors(found.services.map(() => ({})))
      setErrors([])
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
    const available = SERVICE_OPTIONS.find(
      (option) => !provider.services.some((service) => service.type === option)
    )
    const initialType: ProviderFormService["type"] = available ?? ""
    setProvider((prev) => ({
      ...prev,
      services: [...prev.services, { type: initialType, base_url: "" }],
    }))
    setServiceFieldErrors((prev) => [...prev, {}])
  }

  const handleUpdateService = (index: number, field: "type" | "base_url", value: string) => {
    setProvider((prev) => {
      const nextServices = [...prev.services]
      const updated = { ...nextServices[index] }
      if (field === "type") {
        updated.type = value as ProviderFormService["type"]
      } else {
        updated.base_url = value
      }
      nextServices[index] = updated
      return { ...prev, services: nextServices }
    })
    setServiceFieldErrors((prev) => {
      const next = [...prev]
      if (!next[index]) {
        next[index] = {}
      }
      next[index] = {
        ...next[index],
        [field]: undefined,
      }
      return next
    })
  }

  const handleRemoveService = (index: number) => {
    setProvider((prev) => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index),
    }))
    setServiceFieldErrors((prev) => prev.filter((_, i) => i !== index))
  }

  const validateProvider = (): boolean => {
    const newErrors: string[] = []

    if (!provider.name.trim()) {
      newErrors.push("Provider name is required")
    }

    if (provider.api_keys.length === 0) {
      newErrors.push("At least one API key is required")
    }

    provider.api_keys.forEach((key, index) => {
      if (!key.name.trim()) {
        newErrors.push(`API key #${index + 1}: name is required`)
      }
      if (!key.value.trim()) {
        newErrors.push(`API key #${index + 1}: value is required`)
      }
    })

    if (provider.services.length === 0) {
      newErrors.push("At least one service is required")
    }

    const fieldErrors: ServiceFieldError[] = provider.services.map(() => ({}))
    const seenServices = new Set<ProviderServiceType>()
    provider.services.forEach((service, index) => {
      const trimmedBaseURL = service.base_url.trim()

      if (!service.type) {
        newErrors.push(`Service #${index + 1}: type is required`)
        fieldErrors[index].type = "请选择服务类型"
      } else if (seenServices.has(service.type as ProviderServiceType)) {
        newErrors.push(`Service type "${service.type}" already added`)
        fieldErrors[index].type = "服务类型已存在"
      } else {
        seenServices.add(service.type as ProviderServiceType)
      }

      if (!trimmedBaseURL) {
        newErrors.push(`Service #${index + 1}: base URL is required`)
        fieldErrors[index].base_url = "请填写服务 URL"
      }
    })

    setErrors(newErrors)
    setServiceFieldErrors(fieldErrors)
    return newErrors.length === 0
  }

  const handleSave = async () => {
    if (!validateProvider()) {
      return
    }

    setIsSaving(true)
    try {
      const payload: Provider = {
        name: provider.name.trim(),
        api_keys: provider.api_keys.map((key) => ({
          name: key.name.trim(),
          value: key.value.trim(),
        })),
        services: provider.services.map((service) => ({
          type: service.type as ProviderServiceType,
          base_url: service.base_url.trim(),
        })),
      }

      await updateProvider(providerName, payload)
      setServiceFieldErrors(payload.services.map(() => ({})))
      router.push("/providers")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update provider"
      setErrors([message])
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.push("/providers")} className="gap-2">
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
          <div className="space-y-3">
            {provider.services.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add at least one service mapped to this provider.</p>
            ) : (
              provider.services.map((service, idx) => {
                const fieldError = serviceFieldErrors[idx] || {}
                return (
                  <div
                    key={`${service.type}-${idx}`}
                    className={cn(
                      "border rounded-sm p-4 flex flex-col gap-3 md:flex-row md:items-end md:gap-4",
                      fieldError.type || fieldError.base_url ? "border-destructive/40" : "border-border/60"
                    )}
                  >
                    <div className="flex-1 space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Service Type
                      </label>
                      <select
                        value={service.type}
                        onChange={(e) => handleUpdateService(idx, "type", e.target.value)}
                        className={cn(
                          "w-full px-3 py-2 border rounded-sm bg-background text-sm",
                          fieldError.type ? "border-destructive focus-visible:ring-destructive/40" : "border-border"
                        )}
                      >
                        <option value="">Select a service</option>
                        {SERVICE_OPTIONS.map((option) => (
                          <option
                            key={option}
                            value={option}
                          disabled={
                            service.type !== option &&
                            provider.services.some((s, i) => i !== idx && s.type === option)
                          }
                        >
                            {option}
                          </option>
                        ))}
                      </select>
                      {fieldError.type && <p className="text-xs text-destructive">{fieldError.type}</p>}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Service URL (必填)
                      </label>
                      <Input
                        value={service.base_url}
                        onChange={(e) => handleUpdateService(idx, "base_url", e.target.value)}
                        placeholder="https://your-service-endpoint"
                        className={cn(
                          fieldError.base_url ? "border-destructive focus-visible:ring-destructive/40" : undefined
                        )}
                      />
                      {fieldError.base_url && <p className="text-xs text-destructive">{fieldError.base_url}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveService(idx)}
                      className="text-destructive hover:text-destructive md:self-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )
              })
            )}
          </div>

          <Button
            onClick={handleAddService}
            className="gap-2"
            variant="outline"
            type="button"
            disabled={provider.services.length >= SERVICE_OPTIONS.length}
          >
            <Plus className="w-4 h-4" />
            Add Service
          </Button>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-sm p-4 space-y-2">
          <p className="text-sm font-medium text-destructive">Please resolve the following before saving:</p>
          <ul className="text-sm text-destructive space-y-1 list-disc list-inside">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            router.push("/providers")
          }}
        >
          Cancel
        </Button>
        <Button onClick={() => { void handleSave() }} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
