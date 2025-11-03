"use client"

import Link from "next/link"
import type { Provider, ProviderServiceType } from "@/hooks/use-providers"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Plus, Edit, Trash2 } from "lucide-react"
import { useState } from "react"
import { cn, maskApiKey } from "@/lib/utils"
import { withBasePath } from "@/lib/base-path"

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

interface ProvidersListProps {
  providers: Provider[]
  onAdd: (provider: Provider) => Promise<void> | void
  onDelete: (name: string) => Promise<void> | void
}

export function ProvidersList({ providers, onAdd, onDelete }: ProvidersListProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState<ProviderFormData>({
    name: "",
    api_keys: [],
    services: [],
  })
  const [errors, setErrors] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serviceFieldErrors, setServiceFieldErrors] = useState<ServiceFieldError[]>([])

  const handleAddApiKey = () => {
    setFormData({
      ...formData,
      api_keys: [...formData.api_keys, { name: "", value: "" }],
    })
  }

  const handleUpdateApiKey = (index: number, field: "name" | "value", value: string) => {
    const newKeys = [...formData.api_keys]
    newKeys[index][field] = value
    setFormData({ ...formData, api_keys: newKeys })
  }

  const handleRemoveApiKey = (index: number) => {
    setFormData({
      ...formData,
      api_keys: formData.api_keys.filter((_, i) => i !== index),
    })
  }

  const handleAddService = () => {
    setFormData({
      ...formData,
      services: [...formData.services, { type: "", base_url: "" }],
    })
    setServiceFieldErrors((prev) => [...prev, {}])
  }

  const handleUpdateService = (index: number, field: "type" | "base_url", value: string) => {
    const newServices = [...formData.services]
    const updated = { ...newServices[index] }
    if (field === "type") {
      updated.type = value as ProviderFormService["type"]
    } else {
      updated.base_url = value
    }
    newServices[index] = updated
    setFormData({ ...formData, services: newServices })
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
    setFormData({
      ...formData,
      services: formData.services.filter((_, i) => i !== index),
    })
    setServiceFieldErrors((prev) => prev.filter((_, i) => i !== index))
  }

  const validateForm = (): boolean => {
    const newErrors: string[] = []
    const fieldErrors: ServiceFieldError[] = formData.services.map(() => ({}))

    if (!formData.name.trim()) {
      newErrors.push("Provider name is required")
    }

    if (formData.api_keys.length === 0) {
      newErrors.push("At least one API key is required")
    }

    formData.api_keys.forEach((key, index) => {
      if (!key.name.trim()) {
        newErrors.push(`API key #${index + 1}: name is required`)
      }
      if (!key.value.trim()) {
        newErrors.push(`API key #${index + 1}: value is required`)
      }
    })

    if (formData.services.length === 0) {
      newErrors.push("At least one service is required")
    }

    const seenServices = new Set<ProviderServiceType>()
    formData.services.forEach((service, index) => {
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
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const providerPayload: Provider = {
        name: formData.name.trim(),
        api_keys: formData.api_keys.map((key) => ({
          name: key.name.trim(),
          value: key.value.trim(),
        })),
        services: formData.services.map((service) => ({
          type: service.type as ProviderServiceType,
          base_url: service.base_url.trim(),
        })),
      }

      await Promise.resolve(onAdd(providerPayload))
      setFormData({ name: "", api_keys: [], services: [] })
      setErrors([])
      setServiceFieldErrors([])
      setIsOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create provider"
      setErrors([message])
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setFormData({ name: "", api_keys: [], services: [] })
    setErrors([])
    setServiceFieldErrors([])
    setIsOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Providers</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage service providers and their configurations</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Provider
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Provider</DialogTitle>
              <DialogDescription>Create a new service provider with API keys and services</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              {/* Provider Name */}
              <div>
                <label className="text-sm font-medium">Provider Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., OpenAI, Anthropic"
                  className="mt-2"
                />
              </div>

              {/* API Keys */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium">API Keys</label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddApiKey}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Key
                  </Button>
                </div>
                {formData.api_keys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No API keys added. Click "Add Key" to add one.</p>
                ) : (
                  <div className="space-y-2">
                    {formData.api_keys.map((key, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <Input
                          placeholder="Key name (e.g., main-key)"
                          value={key.name}
                          onChange={(e) => handleUpdateApiKey(index, "name", e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          placeholder="API key value"
                          value={key.value}
                          onChange={(e) => handleUpdateApiKey(index, "value", e.target.value)}
                          className="flex-1"
                          type="password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveApiKey(index)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Services */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium">Services</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddService}
                    disabled={formData.services.length >= SERVICE_OPTIONS.length}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Service
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.services.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Add at least one service to enable routing.</p>
                  ) : (
                    formData.services.map((service, index) => {
                      const fieldError = serviceFieldErrors[index] || {}
                      return (
                        <div
                          key={index}
                          className={cn(
                            "flex flex-col gap-2 md:flex-row md:items-center md:gap-3 border rounded-sm p-3",
                            fieldError.type || fieldError.base_url ? "border-destructive/40" : "border-border/50"
                          )}
                        >
                          <div className="flex-1 space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Service Type
                            </label>
                            <select
                              value={service.type}
                              onChange={(e) => handleUpdateService(index, "type", e.target.value)}
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
                                  formData.services.some((s, i) => i !== index && s.type === option)
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
                              placeholder="https://your-service-endpoint"
                              value={service.base_url}
                              onChange={(e) => handleUpdateService(index, "base_url", e.target.value)}
                              className={cn(
                                "w-full",
                                fieldError.base_url ? "border-destructive focus-visible:ring-destructive/40" : undefined
                              )}
                            />
                            {fieldError.base_url && <p className="text-xs text-destructive">{fieldError.base_url}</p>}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveService(index)}
                            className="self-start mt-6 md:mt-7"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Errors */}
              {errors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
                  <p className="text-sm font-medium text-destructive mb-1">Please fix the following errors:</p>
                  <ul className="text-sm text-destructive space-y-1 list-disc list-inside">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => { void handleSave() }} disabled={isSubmitting}>
                  Create Provider
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Providers grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.map((provider) => (
          <Card key={provider.name} className="p-6 hover:bg-secondary/50 transition-colors">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{provider.name}</h3>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">API Keys</p>
                <div className="space-y-1">
                  {provider.api_keys.length > 0 ? (
                    provider.api_keys.map((key, idx) => (
                      <div key={idx} className="text-sm bg-secondary/50 px-2 py-1 rounded-sm font-mono text-xs">
                        <div className="text-muted-foreground text-xs">
                          {typeof key === "object" && key.name ? key.name : "Key"}
                        </div>
                        <div className="text-foreground text-xs truncate">
                          {typeof key === "object" && key.value ? maskApiKey(key.value) : maskApiKey(String(key))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No API keys</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Services</p>
                <div className="flex flex-wrap gap-2">
                  {provider.services.length > 0 ? (
                    provider.services.map((service) => (
                      <div
                        key={service.type}
                        className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-sm max-w-full"
                      >
                        <div className="font-semibold">{service.type}</div>
                        <div className="text-muted-foreground truncate max-w-[160px]" title={service.base_url}>
                          {service.base_url}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No services</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Link href={withBasePath(`/providers/edit?name=${encodeURIComponent(provider.name)}`)} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-2 bg-transparent">
                    <Edit className="w-4 h-4" />
                    Edit
                  </Button>
                </Link>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive bg-transparent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Provider</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{provider.name}"? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex justify-end gap-3">
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          void onDelete(provider.name)
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {providers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No providers yet. Create one to get started.</p>
        </div>
      )}
    </div>
  )
}
