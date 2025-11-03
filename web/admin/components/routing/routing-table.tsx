"use client"

import { useState } from "react"
import type { RoutingStrategy } from "@/hooks/use-routing-strategies"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Check, X } from "lucide-react"
import type { Provider } from "@/hooks/use-providers"
import { useServices } from "@/hooks/use-services"

interface RoutingTableProps {
  strategies: RoutingStrategy[]
  providers: Provider[]
  onAdd: (strategy: Omit<RoutingStrategy, "id">) => void
  onUpdate: (id: string, strategy: Omit<RoutingStrategy, "id">) => void
  onDelete: (id: string) => void
}

export function RoutingTable({ strategies, providers, onAdd, onUpdate, onDelete }: RoutingTableProps) {
  const { services } = useServices()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Omit<RoutingStrategy, "id">>({
    service: "",
    provider: "",
    api_key: "",
  })

  const handleEdit = (strategy: RoutingStrategy) => {
    setEditingId(strategy.id)
    setFormData({
      service: strategy.service,
      provider: strategy.provider,
      api_key: strategy.api_key,
    })
  }

  const handleSave = () => {
    if (!formData.service || !formData.provider || !formData.api_key) {
      return
    }

    if (editingId) {
      onUpdate(editingId, formData)
      setEditingId(null)
    } else {
      onAdd(formData)
    }
    setFormData({ service: "", provider: "", api_key: "" })
  }

  const handleCancel = () => {
    setEditingId(null)
    setFormData({ service: "", provider: "", api_key: "" })
  }

  const selectedProvider = providers.find((p) => p.name === formData.provider)
  const availableKeys = selectedProvider ? selectedProvider.api_keys.map((key) => key.name) : []

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Routing Strategies</h2>
          <p className="text-sm text-muted-foreground mt-1">Configure how requests are routed to providers</p>
        </div>
        {editingId === null && (
          <Button
            onClick={() => {
              setEditingId("new")
              setFormData({ service: "", provider: "", api_key: "" })
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Strategy
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border border-border rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-6 py-3 text-left font-medium">Service</th>
              <th className="px-6 py-3 text-left font-medium">Provider</th>
              <th className="px-6 py-3 text-left font-medium">API Key</th>
              <th className="px-6 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Add new row input */}
            {editingId === "new" && (
              <tr className="border-b border-border bg-secondary/20">
                <td className="px-6 py-4">
                  <select
                    value={formData.service}
                    onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                  >
                    <option value="">Select service</option>
                    {services.map((s) => (
                      <option key={s.name} value={s.type_id}>
                        {s.name} ({s.type_id})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-4">
                  <select
                    value={formData.provider}
                    onChange={(e) => {
                      const providerName = e.target.value
                      const provider = providers.find((p) => p.name === providerName)
                      const firstKey = provider?.api_keys[0]?.name || ""
                      setFormData({ ...formData, provider: providerName, api_key: firstKey })
                    }}
                    className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                  >
                    <option value="">Select provider</option>
                    {providers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-4">
                  <select
                    value={formData.api_key}
                    onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                    disabled={!formData.provider}
                  >
                    <option value="">Select API key</option>
                    {availableKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    className="gap-2 text-primary bg-transparent"
                  >
                    <Check className="w-4 h-4" />
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCancel} className="gap-2 bg-transparent">
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                </td>
              </tr>
            )}

            {/* Existing strategies */}
            {strategies.map((strategy) => (
              <tr
                key={strategy.id}
                className={`border-b border-border hover:bg-secondary/30 transition-colors ${editingId === strategy.id ? "bg-secondary/20" : ""}`}
              >
                {editingId === strategy.id ? (
                  <>
                    <td className="px-6 py-4">
                      <select
                        value={formData.service}
                        onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                      >
                        <option value="">Select service</option>
                        {services.map((s) => (
                          <option key={s.name} value={s.type_id}>
                            {s.name} ({s.type_id})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={formData.provider}
                        onChange={(e) => {
                          const providerName = e.target.value
                          const provider = providers.find((p) => p.name === providerName)
                          const firstKey = provider?.api_keys[0]?.name || ""
                          setFormData({ ...formData, provider: providerName, api_key: firstKey })
                        }}
                        className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                      >
                        <option value="">Select provider</option>
                        {providers.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={formData.api_key}
                        onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-sm bg-background text-sm"
                        disabled={!formData.provider}
                      >
                        <option value="">Select API key</option>
                        {availableKeys.map((key) => (
                          <option key={key} value={key}>
                            {key}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSave}
                        className="gap-2 text-primary bg-transparent"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleCancel} className="gap-2 bg-transparent">
                        <X className="w-4 h-4" />
                      </Button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-6 py-4">
                      {services.find((s) => s.type_id === strategy.service)?.name} ({strategy.service})
                    </td>
                    <td className="px-6 py-4">{strategy.provider}</td>
                    <td className="px-6 py-4 font-mono text-xs bg-secondary/50 px-3 py-1 rounded-sm inline-block">
                      {strategy.api_key}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(strategy)}>
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDelete(strategy.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {strategies.length === 0 && editingId === null && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No routing strategies yet. Create one to get started.</p>
        </div>
      )}
    </div>
  )
}
