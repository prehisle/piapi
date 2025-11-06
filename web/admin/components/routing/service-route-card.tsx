"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Plus, RefreshCcw, Save, Trash2 } from "lucide-react"
import { useRouteStats } from "@/hooks/use-route-stats"
import type { UserServiceRoute, UserServiceCandidate } from "@/hooks/use-users"
import type { CandidateRuntimeStatus } from "@/lib/api"
import type { Provider } from "@/hooks/use-providers"

interface ServiceRouteCardProps {
  serviceType: string
  route: UserServiceRoute
  userApiKey: string
  providers: Provider[]
  onUpdateRoute: (serviceType: string, updatedRoute: UserServiceRoute) => Promise<void>
}

interface NormalizedCandidate extends UserServiceCandidate {
  weight: number
  enabled: boolean
  tags: string[]
}

interface NormalizedRoute {
  strategy: string
  candidates: NormalizedCandidate[]
}

const DEFAULT_STRATEGIES = [
  { value: "round_robin", label: "轮询 (round_robin)" },
  { value: "weighted_rr", label: "加权轮询 (weighted_rr)" },
]

function normalizeRoute(route: UserServiceRoute): NormalizedRoute {
  const strategy = route.strategy || "round_robin"
  if (route.candidates && route.candidates.length > 0) {
    return {
      strategy,
      candidates: route.candidates.map((candidate) => ({
        provider_name: candidate.provider_name,
        provider_key_name: candidate.provider_key_name,
        weight: candidate.weight ?? 1,
        enabled: candidate.enabled ?? true,
        tags: candidate.tags ?? [],
      })),
    }
  }

  if (route.provider_name && route.provider_key_name) {
    return {
      strategy,
      candidates: [
        {
          provider_name: route.provider_name,
          provider_key_name: route.provider_key_name,
          weight: 1,
          enabled: true,
          tags: [],
        },
      ],
    }
  }

  return {
    strategy,
    candidates: [],
  }
}

function toPersistedRoute(route: NormalizedRoute): UserServiceRoute {
  return {
    strategy: route.strategy,
    candidates: route.candidates.map((candidate) => ({
      provider_name: candidate.provider_name,
      provider_key_name: candidate.provider_key_name,
      weight: candidate.weight,
      enabled: candidate.enabled,
      tags: candidate.tags,
    })),
  }
}

function formatNumber(value: number | undefined, fractionDigits = 2) {
  if (value === undefined || Number.isNaN(value)) {
    return "—"
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: fractionDigits })
}

function formatRate(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) {
    return "—"
  }
  return `${(value * 100).toFixed(1)}%`
}

function formatTimestamp(value?: string) {
  if (!value) {
    return "—"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function getStatKey(provider: string, key: string) {
  return `${provider}::${key}`
}

function findProvider(providers: Provider[], name: string | undefined) {
  return providers.find((p) => p.name === name)
}

export function ServiceRouteCard({ serviceType, route, userApiKey, providers, onUpdateRoute }: ServiceRouteCardProps) {
  const normalized = useMemo(() => normalizeRoute(route), [route])
  const [formRoute, setFormRoute] = useState<NormalizedRoute>(normalized)
  const [errorMessage, setErrorMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setFormRoute(normalizeRoute(route))
  }, [route])

  const isDirty = useMemo(() => JSON.stringify(formRoute) !== JSON.stringify(normalized), [formRoute, normalized])

  const { stats, isLoading, error } = useRouteStats(userApiKey, serviceType)

  const statsByKey = useMemo(() => {
    const map = new Map<string, CandidateRuntimeStatus>()
    for (const stat of stats) {
      map.set(getStatKey(stat.provider_name, stat.provider_key_name), stat)
    }
    return map
  }, [stats])

  const handleStrategyChange = (value: string) => {
    setFormRoute((prev) => ({ ...prev, strategy: value }))
  }

  const handleProviderChange = (index: number, providerName: string) => {
    setFormRoute((prev) => {
      const next = { ...prev }
      const candidates = [...next.candidates]
      const target = { ...candidates[index], provider_name: providerName }
      const provider = findProvider(providers, providerName)
      const firstKey = provider?.api_keys[0]?.name ?? ""
      target.provider_key_name = firstKey
      candidates[index] = target
      next.candidates = candidates
      return next
    })
  }

  const handleKeyChange = (index: number, keyName: string) => {
    setFormRoute((prev) => {
      const next = { ...prev }
      const candidates = [...next.candidates]
      candidates[index] = { ...candidates[index], provider_key_name: keyName }
      next.candidates = candidates
      return next
    })
  }

  const handleWeightChange = (index: number, value: string) => {
    const parsed = Number.parseInt(value, 10)
    setFormRoute((prev) => {
      const next = { ...prev }
      const candidates = [...next.candidates]
      candidates[index] = {
        ...candidates[index],
        weight: Number.isNaN(parsed) || parsed <= 0 ? 1 : parsed,
      }
      next.candidates = candidates
      return next
    })
  }

  const handleEnabledChange = (index: number, enabled: boolean) => {
    setFormRoute((prev) => {
      const next = { ...prev }
      const candidates = [...next.candidates]
      candidates[index] = { ...candidates[index], enabled }
      next.candidates = candidates
      return next
    })
  }

  const handleAddCandidate = () => {
    const defaultProvider = providers[0]
    const defaultKey = defaultProvider?.api_keys[0]?.name ?? ""
    setFormRoute((prev) => ({
      ...prev,
      candidates: [
        ...prev.candidates,
        {
          provider_name: defaultProvider?.name ?? "",
          provider_key_name: defaultKey,
          weight: 1,
          enabled: true,
          tags: [],
        },
      ],
    }))
  }

  const handleRemoveCandidate = (index: number) => {
    setFormRoute((prev) => ({
      ...prev,
      candidates: prev.candidates.length <= 1 ? prev.candidates : prev.candidates.filter((_, i) => i !== index),
    }))
  }

  const handleReset = () => {
    setFormRoute(normalized)
    setErrorMessage("")
  }

  const handleSave = async () => {
    if (formRoute.candidates.length === 0) {
      setErrorMessage("至少保留一个候选上游")
      return
    }
    for (const candidate of formRoute.candidates) {
      if (!candidate.provider_name) {
        setErrorMessage("候选上游缺少 providerName")
        return
      }
      if (!candidate.provider_key_name) {
        setErrorMessage("候选上游缺少 providerKeyName")
        return
      }
    }

    setErrorMessage("")
    setIsSaving(true)
    try {
      await onUpdateRoute(serviceType, toPersistedRoute(formRoute))
    } catch (saveError) {
      console.error("failed to save candidate route", saveError)
      setErrorMessage(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="capitalize">{serviceType}</CardTitle>
          <CardDescription>{serviceType} 的路由策略</CardDescription>
        </div>
        <Badge variant="secondary" className="uppercase tracking-wide">
          {formRoute.strategy}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm font-medium">调度策略</label>
            <select
              className="w-full sm:w-64 border border-border rounded-sm px-3 py-2 text-sm bg-background"
              value={formRoute.strategy}
              onChange={(event) => handleStrategyChange(event.target.value)}
            >
              {DEFAULT_STRATEGIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {formRoute.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚未为该服务配置候选上游。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>上游服务商</TableHead>
                  <TableHead>命名 Key</TableHead>
                  <TableHead className="text-right">权重</TableHead>
                  <TableHead className="text-center">启用</TableHead>
                  <TableHead>健康状态</TableHead>
                  <TableHead className="text-right">请求数</TableHead>
                  <TableHead className="text-right">错误数</TableHead>
                  <TableHead className="text-right">错误率</TableHead>
                  <TableHead>最近错误</TableHead>
                  <TableHead>最后更新</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formRoute.candidates.map((candidate, index) => {
                  const provider = findProvider(providers, candidate.provider_name)
                  const providerKeys = provider?.api_keys ?? []
                  const statKey = getStatKey(candidate.provider_name, candidate.provider_key_name)
                  const stat = statsByKey.get(statKey)
                  const computedHealthy = candidate.enabled && (stat ? stat.healthy : true)
                  const statusLabel = candidate.enabled
                    ? stat
                      ? stat.healthy
                        ? "健康"
                        : "异常"
                      : "未知"
                    : "已停用"

                  const rowKey = `${candidate.provider_name}-${candidate.provider_key_name}-${index}`

                  return (
                    <TableRow key={rowKey}>
                      <TableCell className="min-w-[160px]">
                        <select
                          className="w-full border border-border rounded-sm px-2 py-1 text-sm bg-background"
                          value={candidate.provider_name}
                          onChange={(event) => handleProviderChange(index, event.target.value)}
                        >
                          <option value="" disabled>
                            请选择 provider
                          </option>
                          {providers.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <select
                          className="w-full border border-border rounded-sm px-2 py-1 text-sm bg-background"
                          value={candidate.provider_key_name}
                          onChange={(event) => handleKeyChange(index, event.target.value)}
                          disabled={!candidate.provider_name || providerKeys.length === 0}
                        >
                          <option value="" disabled>
                            {candidate.provider_name ? "请选择 key" : "请先选择 provider"}
                          </option>
                          {providerKeys.length === 0 && candidate.provider_name && <option value="">无可用 key</option>}
                          {providerKeys.map((key) => (
                            <option key={key.name} value={key.name}>
                              {key.name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={1}
                          className="text-right"
                          value={candidate.weight}
                          onChange={(event) => handleWeightChange(index, event.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={candidate.enabled}
                          onCheckedChange={(value) => handleEnabledChange(index, value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={computedHealthy ? "secondary" : "destructive"}>{statusLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(stat?.total_requests, 0)}</TableCell>
                      <TableCell className="text-right">{formatNumber(stat?.total_errors, 0)}</TableCell>
                      <TableCell className="text-right">{formatRate(stat?.error_rate)}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={stat?.last_error}>
                        {stat?.last_error ? stat.last_error : "—"}
                      </TableCell>
                      <TableCell>{formatTimestamp(stat?.last_updated)}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveCandidate(index)}
                          disabled={formRoute.candidates.length <= 1}
                          title="删除候选"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleAddCandidate}>
              <Plus className="w-4 h-4" /> 新增候选
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleReset}
                disabled={!isDirty || isSaving}
              >
                <RefreshCcw className="w-4 h-4" /> 重置
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn("gap-2", isDirty ? "" : "opacity-70")}
                onClick={handleSave}
                disabled={!isDirty || isSaving}
              >
                <Save className="w-4 h-4" /> {isSaving ? "保存中" : "保存"}
              </Button>
            </div>
          </div>

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        </div>

        {isLoading && <p className="mt-2 text-xs text-muted-foreground">正在刷新运行时统计…</p>}
        {error && (
          <p className="mt-2 text-xs text-destructive">
            无法获取运行时统计：{error instanceof Error ? error.message : String(error)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
