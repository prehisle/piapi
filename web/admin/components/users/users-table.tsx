"use client"

import { Fragment, useMemo, useState } from "react"
import type { User } from "@/hooks/use-users"
import type { Provider } from "@/hooks/use-providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

interface UsersTableProps {
  users: User[]
  providers: Provider[]
  onAdd: (user: User) => Promise<void> | void
  onUpdate: (name: string, user: User) => Promise<void> | void
  onDelete: (name: string) => Promise<void> | void
}

interface RouteFormEntry {
  service: string
  provider: string
  key: string
}

const createEmptyRoute = (): RouteFormEntry => ({ service: "", provider: "", key: "" })

const routesToServicesMap = (routes: RouteFormEntry[]): User["services"] => {
  const map: User["services"] = {}
  routes.forEach((route) => {
    if (!route.service) {
      return
    }
    map[route.service] = {
      provider_name: route.provider,
      provider_key_name: route.key,
    }
  })
  return map
}

const normalizeRoutesFromUser = (user: User): RouteFormEntry[] => {
  const entries = Object.entries(user.services || {}).map(([serviceType, route]) => ({
    service: serviceType,
    provider: route.provider_name,
    key: route.provider_key_name,
  }))
  return entries.length > 0 ? entries : [createEmptyRoute()]
}

export function UsersTable({ users, providers, onAdd, onUpdate, onDelete }: UsersTableProps) {
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState<User>({ name: "", api_key: "", services: {} })
  const [errors, setErrors] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [routes, setRoutes] = useState<RouteFormEntry[]>([createEmptyRoute()])
  const [routesDrafts, setRoutesDrafts] = useState<Record<string, RouteFormEntry[]>>({})
  const [routeErrors, setRouteErrors] = useState<Record<string, string[]>>({})
  const [savingUsers, setSavingUsers] = useState<Record<string, boolean>>({})

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

      if (!route.provider) {
        routeErrors.push(`${label}: provider is required`)
      } else {
        const provider = providerMap.get(route.provider)
        if (!provider) {
          routeErrors.push(`${label}: selected provider not found`)
        } else if (route.service && !provider.services.some((svc) => svc.type === route.service)) {
          routeErrors.push(`${label}: provider does not offer service '${route.service}'`)
        }
      }

      if (!route.key) {
        routeErrors.push(`${label}: API key is required`)
      } else {
        const provider = providerMap.get(route.provider)
        if (provider && !provider.api_keys.some((key) => key.name === route.key)) {
          routeErrors.push(`${label}: API key '${route.key}' not found on provider`)
        }
      }
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
    await navigator.clipboard.writeText(text)
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
    updateFn: (index: number, field: keyof RouteFormEntry, value: string) => void,
    removeFn: (index: number) => void,
    addFn: () => void,
    disableAdd: boolean
  ) => (
    <div className="space-y-3">
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
        <div className="space-y-3">
          {routesState.map((route, index) => {
          const providersForService = route.service
            ? providers.filter((providerOption) => providerOption.services.some((svc) => svc.type === route.service))
            : providers
            const provider = route.provider ? providerMap.get(route.provider) : undefined
            const providerKeys = provider?.api_keys ?? []
            const providerExists = route.provider
              ? providersForService.some((candidate) => candidate.name === route.provider)
              : true
            const keyExists = route.key ? providerKeys.some((key) => key.name === route.key) : true
            return (
              <div
                key={`${route.service || "_"}-${index}`}
                className="border border-border/60 rounded-sm p-3 flex flex-col gap-3 md:flex-row md:items-end md:gap-3"
              >
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Service</label>
                  <select
                    value={route.service}
                    onChange={(e) => updateFn(index, "service", e.target.value)}
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
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Provider
                  </label>
                  <select
                    value={route.provider}
                    onChange={(e) => updateFn(index, "provider", e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                    disabled={providersForService.length === 0}
                  >
                    <option value="">Select provider</option>
                    {providersForService.map((providerOption) => (
                      <option key={providerOption.name} value={providerOption.name}>
                        {providerOption.name}
                      </option>
                    ))}
                    {route.provider && !providerExists && (
                      <option value={route.provider} disabled>
                        {route.provider} (missing)
                      </option>
                    )}
                  </select>
                </div>
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Provider Key
                  </label>
                  <select
                    value={route.key}
                    onChange={(e) => updateFn(index, "key", e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                    disabled={!route.provider || providerKeys.length === 0}
                  >
                    <option value="">Select key</option>
                    {providerKeys.map((key) => (
                      <option key={key.name} value={key.name}>
                        {key.name}
                      </option>
                    ))}
                    {route.key && !keyExists && (
                      <option value={route.key} disabled>
                        {route.key} (missing)
                      </option>
                    )}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFn(index)}
                  className="text-destructive hover:text-destructive md:self-center"
                  disabled={routesState.length <= 1}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const handleAddRoute = () => {
    if (serviceOptions.length === 0 || routes.length >= serviceOptions.length) {
      return
    }
    setRoutes((prev) => [...prev, createEmptyRoute()])
  }

  const handleUpdateRoute = (index: number, field: keyof RouteFormEntry, value: string) => {
    setRoutes((prev) => {
      const next = [...prev]
      const updated = { ...next[index] }
      if (field === "service") {
        updated.service = value
        updated.provider = ""
        updated.key = ""
      } else if (field === "provider") {
        updated.provider = value
        updated.key = ""
      } else {
        updated.key = value
      }
      next[index] = updated
      return next
    })
  }

  const handleRemoveRoute = (index: number) => {
    setRoutes((prev) => {
      if (prev.length <= 1) {
        return [createEmptyRoute()]
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  const getDraftRoutes = (user: User): RouteFormEntry[] => routesDrafts[user.name] ?? normalizeRoutesFromUser(user)

  const setDraftRoutesForUser = (userName: string, nextRoutes: RouteFormEntry[]) => {
    setRoutesDrafts((prev) => ({
      ...prev,
      [userName]: nextRoutes,
    }))
  }

  const clearDraftForUser = (userName: string) => {
    setRoutesDrafts((prev) => {
      if (!(userName in prev)) {
        return prev
      }
      const next = { ...prev }
      delete next[userName]
      return next
    })
    setRouteErrors((prev) => {
      if (!(userName in prev)) {
        return prev
      }
      const next = { ...prev }
      delete next[userName]
      return next
    })
    setSavingUsers((prev) => {
      if (!(userName in prev)) {
        return prev
      }
      const next = { ...prev }
      delete next[userName]
      return next
    })
  }

  const updateDraftRoutesForUser = (user: User, updater: (current: RouteFormEntry[]) => RouteFormEntry[]) => {
    setRoutesDrafts((prev) => {
      const current = prev[user.name] ?? normalizeRoutesFromUser(user)
      const currentCopy = current.map((route) => ({ ...route }))
      const next = updater(currentCopy)
      return {
        ...prev,
        [user.name]: next,
      }
    })
  }

  const setRouteErrorsForUser = (userName: string, errors: string[]) => {
    setRouteErrors((prev) => {
      const next = { ...prev }
      if (errors.length === 0) {
        delete next[userName]
      } else {
        next[userName] = errors
      }
      return next
    })
  }

  const setSavingForUser = (userName: string, saving: boolean) => {
    setSavingUsers((prev) => ({
      ...prev,
      [userName]: saving,
    }))
  }

  const handleSaveRouteChanges = async (user: User) => {
    const draftRoutes = getDraftRoutes(user)
    const errors = validateRoutes(draftRoutes)
    if (errors.length > 0) {
      setRouteErrorsForUser(user.name, errors)
      return
    }

    setRouteErrorsForUser(user.name, [])
    setSavingForUser(user.name, true)
    try {
      const servicesMap = routesToServicesMap(draftRoutes)
      await Promise.resolve(
        onUpdate(user.name, {
          ...user,
          services: servicesMap,
        })
      )
      clearDraftForUser(user.name)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update routes"
      setRouteErrorsForUser(user.name, [message])
    } finally {
      setSavingUsers((prev) => {
        if (!(user.name in prev)) {
          return prev
        }
        const next = { ...prev }
        delete next[user.name]
        return next
      })
    }
  }

  const handleResetRoutes = (user: User) => {
    clearDraftForUser(user.name)
  }

  const handleDeleteUser = async (name: string) => {
    clearDraftForUser(name)
    await Promise.resolve(onDelete(name))
  }

  const validateForm = (): boolean => {
    const newErrors: string[] = []
    if (!formData.name.trim()) {
      newErrors.push("Username is required")
    }
    if (!formData.api_key.trim()) {
      newErrors.push("API key is required")
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
      const servicesMap: User["services"] = {}
      routes.forEach((route) => {
        servicesMap[route.service] = {
          provider_name: route.provider,
          provider_key_name: route.key,
        }
      })

      await Promise.resolve(
        onAdd({
          name: formData.name.trim(),
          api_key: formData.api_key.trim(),
          services: servicesMap,
        })
      )
      setFormData({ name: "", api_key: "", services: {} })
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
              setFormData({ name: "", api_key: "", services: {} })
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
                <Input
                  value={formData.api_key}
                  onChange={(e) => setFormData((prev) => ({ ...prev, api_key: e.target.value }))}
                  placeholder="e.g., sk_live_..."
                  className="mt-2"
                />
              </div>
              {renderRoutesForm(
                routes,
                handleUpdateRoute,
                handleRemoveRoute,
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
              const draftRoutes = getDraftRoutes(user)
              const disableAddRoute = serviceOptions.length === 0 || draftRoutes.length >= serviceOptions.length
              const userErrors = routeErrors[user.name] ?? []
              const isSaving = savingUsers[user.name] ?? false

              const addRouteForUser = () => {
                if (disableAddRoute) {
                  return
                }
                updateDraftRoutesForUser(user, (current) => [...current, createEmptyRoute()])
              }

              const updateRouteForUser = (index: number, field: keyof RouteFormEntry, value: string) => {
                updateDraftRoutesForUser(user, (current) => {
                  const next = current.map((route) => ({ ...route }))
                  const target = next[index] ?? createEmptyRoute()
                  if (field === "service") {
                    target.service = value
                    target.provider = ""
                    target.key = ""
                  } else if (field === "provider") {
                    target.provider = value
                    target.key = ""
                  } else {
                    target.key = value
                  }
                  next[index] = target
                  return next
                })
              }

              const removeRouteForUser = (index: number) => {
                updateDraftRoutesForUser(user, (current) => {
                  if (current.length <= 1) {
                    return [createEmptyRoute()]
                  }
                  return current.filter((_, i) => i !== index)
                })
              }

              const resetRoutesForUser = () => {
                handleResetRoutes(user)
              }

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
                        {renderRoutesForm(
                          draftRoutes,
                          updateRouteForUser,
                          removeRouteForUser,
                          addRouteForUser,
                          disableAddRoute
                        )}
                        {userErrors.length > 0 && (
                          <div className="bg-destructive/10 border border-destructive/20 rounded-sm p-3">
                            <p className="text-sm font-medium text-destructive mb-1">Please resolve the following:</p>
                            <ul className="text-sm text-destructive space-y-1 list-disc list-inside">
                              {userErrors.map((error, index) => (
                                <li key={index}>{error}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={resetRoutesForUser} disabled={isSaving}>
                            Reset
                          </Button>
                          <Button
                            onClick={() => {
                              void handleSaveRouteChanges(user)
                            }}
                            disabled={isSaving || serviceOptions.length === 0}
                          >
                            {isSaving ? "Saving..." : "Save Routes"}
                          </Button>
                        </div>
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
