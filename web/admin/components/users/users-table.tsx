"use client"

import { Fragment, useMemo, useState } from "react"
import type { User, UserServiceRoute } from "@/hooks/use-users"
import type { Provider } from "@/hooks/use-providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { Plus, Eye, EyeOff, Copy, Trash2 } from "lucide-react"
import { ServiceRouteCard } from "@/components/routing/service-route-card"

interface UsersTableProps {
  users: User[]
  providers: Provider[]
  onAdd: (user: User) => Promise<void> | void
  onUpdate: (name: string, user: User) => Promise<void> | void
  onDelete: (name: string) => Promise<void> | void
}

interface CandidateFormEntry {
  provider: string
  key: string
  weight: number
  enabled: boolean
  originalTags?: string[]
}

interface RouteFormEntry {
  service: string
  strategy: string
  candidates: CandidateFormEntry[]
}

const createEmptyCandidate = (): CandidateFormEntry => ({ provider: "", key: "", weight: 1, enabled: true, originalTags: [] })

const createEmptyRoute = (): RouteFormEntry => ({ service: "", strategy: "round_robin", candidates: [createEmptyCandidate()] })

const STRATEGY_OPTIONS = [
  { value: "round_robin", label: "轮询 (round_robin)" },
  { value: "weighted_rr", label: "加权轮询 (weighted_rr)" },
]

const generateApiKey = () => {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    window.crypto.getRandomValues(bytes)
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    return `piapi_key_${hex}`
  }
  return `piapi_key_${Math.random().toString(36).slice(2)}`
}

const routesToServicesMap = (routes: RouteFormEntry[]): User["services"] => {
  const map: User["services"] = {}
  routes.forEach((route) => {
    if (!route.service) {
      return
    }

    const candidates = route.candidates
      .filter((candidate) => candidate.provider && candidate.key)
      .map((candidate) => ({
        provider_name: candidate.provider,
        provider_key_name: candidate.key,
        weight: candidate.weight > 0 ? candidate.weight : 1,
        enabled: candidate.enabled,
        tags: candidate.originalTags ?? [],
      }))

    if (candidates.length === 0) {
      return
    }

    map[route.service] = {
      strategy: route.strategy || "round_robin",
      candidates,
    }
  })
  return map
}

export function UsersTable({ users, providers, onAdd, onUpdate, onDelete }: UsersTableProps) {
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState<User>({ name: "", api_key: generateApiKey(), services: {} })
  const [errors, setErrors] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [routes, setRoutes] = useState<RouteFormEntry[]>([createEmptyRoute()])

  const serviceOptions = useMemo(() => {
    const types = new Set<string>()
    providers.forEach((provider) => {
      provider.services.forEach((service) => types.add(service.type))
    })
    return Array.from(types)
  }, [providers])

  const providerMap = useMemo(() => {
    const map = new Map<string, Provider>()
    providers.forEach((provider) => {
      map.set(provider.name, provider)
    })
    return map
  }, [providers])

  const providersForService = (service: string) =>
    service ? providers.filter((provider) => provider.services.some((svc) => svc.type === service)) : providers

const createDefaultCandidateForService = (service: string): CandidateFormEntry => {
  if (!service) {
    return createEmptyCandidate()
  }
  const candidates = providersForService(service)
  const defaultProvider = candidates[0]
  const defaultKey = defaultProvider?.api_keys[0]?.name ?? ""
  return {
    provider: defaultProvider?.name ?? "",
    key: defaultKey,
    weight: 1,
    enabled: true,
    originalTags: [],
  }
}

const findProvider = (providers: Provider[], name: string | undefined) =>
  providers.find((provider) => provider.name === name)

  const validateRoutes = (routesList: RouteFormEntry[]): string[] => {
    const routeErrors: string[] = []
    if (serviceOptions.length === 0) {
      routeErrors.push("Configure provider services before managing user routes")
      return routeErrors
    }
    if (routesList.length === 0) {
      routeErrors.push("At least one service route is required")
      return routeErrors
    }
    const uniqueServices = new Set<string>()
    routesList.forEach((route, index) => {
      const label = `Route #${index + 1}`
      if (!route.service) {
        routeErrors.push(`${label}: service is required`)
      } else if (uniqueServices.has(route.service)) {
        routeErrors.push(`Service '${route.service}' already mapped`)
      } else {
        uniqueServices.add(route.service)
      }

      if (!route.strategy) {
        routeErrors.push(`${label}: strategy is required`)
      }

      if (route.candidates.length === 0) {
        routeErrors.push(`${label}: at least one candidate is required`)
      }

      route.candidates.forEach((candidate, candidateIndex) => {
        const candidateLabel = `${label} -> Candidate #${candidateIndex + 1}`
        if (!candidate.provider) {
          routeErrors.push(`${candidateLabel}: provider is required`)
        }
        if (!candidate.key) {
          routeErrors.push(`${candidateLabel}: provider key is required`)
        }

        if (candidate.provider) {
          const provider = providerMap.get(candidate.provider)
          if (!provider) {
            routeErrors.push(`${candidateLabel}: provider '${candidate.provider}' not found`)
          } else {
            if (route.service && !provider.services.some((svc) => svc.type === route.service)) {
              routeErrors.push(`${candidateLabel}: provider does not offer service '${route.service}'`)
            }
            if (candidate.key && !provider.api_keys.some((key) => key.name === candidate.key)) {
              routeErrors.push(`${candidateLabel}: key '${candidate.key}' not found on provider '${candidate.provider}'`)
            }
          }
        }
        if (candidate.weight <= 0) {
          routeErrors.push(`${candidateLabel}: weight must be greater than 0`)
        }
      })
    })

    return routeErrors
  }

  const toggleKeyVisibility = (name: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const copyToClipboard = async (text: string) => {
    // Try modern clipboard API first (requires HTTPS or localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return
      } catch (err) {
        console.warn('Clipboard API failed, falling back to execCommand', err)
      }
    }

    // Fallback for HTTP or older browsers
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      textArea.style.top = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)

      if (!successful) {
        throw new Error('execCommand failed')
      }
    } catch (err) {
      console.error('Copy failed:', err)
      throw new Error('Failed to copy to clipboard. Please copy manually.')
    }
  }

  const copyUserConfig = async (user: User) => {
    const services = Object.entries(user.services || {})
    const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : ""
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE ?? fallbackOrigin
    const lines: string[] = []
    lines.push(`User: ${user.name}`)
    lines.push(`API Key: ${user.api_key}`)

    if (services.length > 0) {
      lines.push("Services:")
      services.forEach(([serviceType]) => {
        const normalizedType = serviceType.replace(/^\//, "")
        const url = `${baseUrl}/piapi/${normalizedType}`
        lines.push(`- ${serviceType}: ${url}`)
      })
    } else {
      lines.push("Services: (none)")
    }

    await copyToClipboard(lines.join("\n"))
  }

  const renderRoutesForm = (
    routesState: RouteFormEntry[],
    handlers: {
      changeService: (index: number, value: string) => void
      changeStrategy: (index: number, value: string) => void
      updateCandidate: (index: number, candidateIndex: number, updater: (candidate: CandidateFormEntry) => CandidateFormEntry) => void
      addCandidate: (index: number) => void
      removeCandidate: (index: number, candidateIndex: number) => void
      removeRoute: (index: number) => void
    },
    addFn: () => void,
    disableAdd: boolean
  ) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Service Routes</label>
        <Button type="button" variant="outline" size="sm" onClick={addFn} disabled={disableAdd}>
          <Plus className="w-4 h-4 mr-1" />
          Add Route
        </Button>
      </div>
      {serviceOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Configure provider services to enable user routing.</p>
      ) : (
        <div className="space-y-4">
          {routesState.map((route, index) => {
            const providersForService = route.service
              ? providers.filter((providerOption) => providerOption.services.some((svc) => svc.type === route.service))
              : providers

            return (
              <div key={`${route.service || "_"}-${index}`} className="border border-border/60 rounded-sm p-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Service</label>
                    <select
                      value={route.service}
                      onChange={(event) => handlers.changeService(index, event.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                    >
                      <option value="">Select service</option>
                      {serviceOptions.map((option) => (
                        <option
                          key={option}
                          value={option}
                          disabled={routesState.some((r, i) => i !== index && r.service === option)}
                        >
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Strategy</label>
                    <select
                      value={route.strategy}
                      onChange={(event) => handlers.changeStrategy(index, event.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                    >
                      {STRATEGY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  {route.candidates.map((candidate, candidateIndex) => {
                    const provider = findProvider(providers, candidate.provider)
                    const providerKeys = provider?.api_keys ?? []
                    return (
                      <div
                        key={`${candidate.provider}-${candidate.key}-${candidateIndex}`}
                        className="border border-border/40 rounded-sm p-3 grid gap-4 md:grid-cols-4"
                      >
                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provider</label>
                          <select
                            value={candidate.provider}
                            onChange={(event) => {
                              const selected = findProvider(providers, event.target.value)
                              const firstKey = selected?.api_keys[0]?.name ?? ""
                              handlers.updateCandidate(index, candidateIndex, (prev) => ({
                                ...prev,
                                provider: event.target.value,
                                key: firstKey,
                                originalTags: [],
                              }))
                            }}
                            className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                            disabled={providersForService.length === 0}
                          >
                            <option value="">Select provider</option>
                            {providersForService.map((providerOption) => (
                              <option key={providerOption.name} value={providerOption.name}>
                                {providerOption.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key</label>
                          <select
                            value={candidate.key}
                            onChange={(event) =>
                              handlers.updateCandidate(index, candidateIndex, (prev) => ({
                                ...prev,
                                key: event.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                            disabled={!candidate.provider || providerKeys.length === 0}
                          >
                            <option value="">{candidate.provider ? "Select key" : "Pick provider first"}</option>
                            {providerKeys.map((keyOption) => (
                              <option key={keyOption.name} value={keyOption.name}>
                                {keyOption.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Weight</label>
                          <Input
                            type="number"
                            min={1}
                            value={candidate.weight}
                            onChange={(event) =>
                              handlers.updateCandidate(index, candidateIndex, (prev) => ({
                                ...prev,
                                weight: Number.parseInt(event.target.value, 10) || 1,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2 flex flex-col">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Enabled</label>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={candidate.enabled}
                              onCheckedChange={(value) =>
                                handlers.updateCandidate(index, candidateIndex, (prev) => ({
                                  ...prev,
                                  enabled: value,
                                }))
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handlers.removeCandidate(index, candidateIndex)}
                              disabled={route.candidates.length <= 1}
                              title="Remove candidate"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-between flex-col gap-2 sm:flex-row sm:items-center">
                  <Button type="button" variant="outline" size="sm" onClick={() => handlers.addCandidate(index)}>
                    <Plus className="w-4 h-4 mr-1" /> Add Candidate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handlers.removeRoute(index)}
                    disabled={routesState.length <= 1}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Remove Route
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const updateRouteState = (index: number, updater: (route: RouteFormEntry) => RouteFormEntry) => {
    setRoutes((prev) => {
      if (!prev[index]) {
        return prev
      }
      const next = [...prev]
      next[index] = updater(cloneRoute(prev[index]))
      return next
    })
  }

  const handleAddRoute = () => {
    if (serviceOptions.length === 0 || routes.length >= serviceOptions.length) {
      return
    }
    setRoutes((prev) => [...prev, createEmptyRoute()])
  }

  const routeHandlersForCreate = {
    changeService: (index: number, value: string) =>
      updateRouteState(index, (route) => applyServiceChange(route, value)),
    changeStrategy: (index: number, value: string) =>
      updateRouteState(index, (route) => applyStrategyChange(route, value)),
    updateCandidate: (
      index: number,
      candidateIndex: number,
      updater: (candidate: CandidateFormEntry) => CandidateFormEntry
    ) => updateRouteState(index, (route) => applyCandidateUpdate(route, candidateIndex, updater)),
    addCandidate: (index: number) => updateRouteState(index, (route) => applyCandidateAdd(route)),
    removeCandidate: (index: number, candidateIndex: number) =>
      updateRouteState(index, (route) => applyCandidateRemove(route, candidateIndex)),
    removeRoute: (index: number) =>
      setRoutes((prev) => {
        if (prev.length <= 1) {
          return prev
        }
        const next = prev.filter((_, i) => i !== index)
        return next.length === 0 ? [createEmptyRoute()] : next
      }),
  }

  const cloneCandidate = (candidate: CandidateFormEntry): CandidateFormEntry => ({ ...candidate })

  const cloneRoute = (route: RouteFormEntry): RouteFormEntry => ({
    ...route,
    candidates: route.candidates.map(cloneCandidate),
  })

  const applyServiceChange = (route: RouteFormEntry, service: string): RouteFormEntry => {
    const next = cloneRoute(route)
    next.service = service
    next.candidates = [createDefaultCandidateForService(service)]
    return next
  }

  const applyStrategyChange = (route: RouteFormEntry, strategy: string): RouteFormEntry => {
    const next = cloneRoute(route)
    next.strategy = strategy || "round_robin"
    return next
  }

  const applyCandidateUpdate = (
    route: RouteFormEntry,
    candidateIndex: number,
    updater: (candidate: CandidateFormEntry) => CandidateFormEntry
  ): RouteFormEntry => {
    const next = cloneRoute(route)
    const currentCandidate = next.candidates[candidateIndex] ?? createEmptyCandidate()
    next.candidates[candidateIndex] = updater(cloneCandidate(currentCandidate))
    return next
  }

  const applyCandidateAdd = (route: RouteFormEntry): RouteFormEntry => {
    const next = cloneRoute(route)
    const candidate = route.service ? createDefaultCandidateForService(route.service) : createEmptyCandidate()
    next.candidates = [...next.candidates, candidate]
    return next
  }

  const applyCandidateRemove = (route: RouteFormEntry, candidateIndex: number): RouteFormEntry => {
    const next = cloneRoute(route)
    if (next.candidates.length <= 1) {
      return next
    }
    next.candidates = next.candidates.filter((_, i) => i !== candidateIndex)
    return next
  }

  const handleUpdateRouteForUser = async (user: User, serviceType: string, updatedRoute: UserServiceRoute) => {
    const nextServices = { ...user.services }
    nextServices[serviceType] = updatedRoute
    await Promise.resolve(
      onUpdate(user.name, {
        ...user,
        services: nextServices,
      })
    )
  }

  const handleDeleteUser = async (name: string) => {
    await Promise.resolve(onDelete(name))
  }

  const validateForm = (): boolean => {
    const newErrors: string[] = []
    if (!formData.name.trim()) {
      newErrors.push("Username is required")
    }
    // API key 始终自动生成，此处仅确保存在
    if (!formData.api_key.trim()) {
      newErrors.push("API key generation failed")
    }
    const routeErrors = validateRoutes(routes)
    newErrors.push(...routeErrors)

    setErrors(newErrors)
    return newErrors.length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const servicesMap = routesToServicesMap(routes)

      await Promise.resolve(
        onAdd({
          name: formData.name.trim(),
          api_key: formData.api_key.trim(),
          services: servicesMap,
        })
      )
      setFormData({ name: "", api_key: generateApiKey(), services: {} })
      setRoutes([createEmptyRoute()])
      setErrors([])
      setIsOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create user"
      setErrors([message])
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Users</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage API users and their configurations</p>
        </div>
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open)
            if (!open) {
              setFormData({ name: "", api_key: generateApiKey(), services: {} })
              setRoutes([createEmptyRoute()])
              setErrors([])
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
              <DialogDescription>Create a new API user</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Username</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., user1"
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">API Key</label>
                <div className="mt-2 flex gap-2">
                  <Input value={formData.api_key} readOnly className="font-mono" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, api_key: generateApiKey() }))
                    }}
                  >
                    Regenerate
                  </Button>
                </div>
              </div>
              {renderRoutesForm(
                routes,
                routeHandlersForCreate,
                handleAddRoute,
                serviceOptions.length === 0 || routes.length >= serviceOptions.length
              )}
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
              <Button onClick={() => { void handleSave() }} className="w-full" disabled={isSubmitting}>
                Create User
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="border border-border rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-6 py-3 text-left font-medium">Username</th>
              <th className="px-6 py-3 text-left font-medium">API Key</th>
              <th className="px-6 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isVisible = visibleKeys.has(user.name)
              const servicesEntries = Object.entries(user.services ?? {})

              return (
                <Fragment key={user.name}>
                  <tr className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-6 py-4 font-medium">{user.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-secondary/50 px-2 py-1 rounded-sm">
                          {isVisible ? user.api_key : "••••••••••••••••••••••••"}
                        </span>
                        <button
                          onClick={() => toggleKeyVisibility(user.name)}
                          className="p-1 hover:bg-secondary/50 rounded-sm transition-colors"
                          title={isVisible ? "Hide" : "Show"}
                        >
                          {isVisible ? (
                            <EyeOff className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                    </div>
                  </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void copyUserConfig(user)
                        }}
                        className="inline-flex items-center gap-1"
                        title="复制用户配置"
                      >
                        <Copy className="w-4 h-4" />
                        Copy
                      </Button>

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
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete user "{user.name}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="flex justify-end gap-3">
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                void handleDeleteUser(user.name)
                              }}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </div>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                  <tr className="border-b border-border/60 bg-secondary/10">
                    <td colSpan={3} className="px-6 py-4">
                      <div className="space-y-4">
                        {servicesEntries.map(([serviceType, route]) => (
                          <ServiceRouteCard
                            key={serviceType}
                            serviceType={serviceType}
                            route={route}
                            userApiKey={user.api_key}
                            providers={providers}
                            onUpdateRoute={(targetService, updatedRoute) =>
                              handleUpdateRouteForUser(user, targetService, updatedRoute)
                            }
                          />
                        ))}

                        {servicesEntries.length === 0 && (
                          <p className="text-sm text-muted-foreground">该用户尚未配置任何服务路由。</p>
                        )}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No users yet. Create one to get started.</p>
        </div>
      )}
    </div>
  )
}
