"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

interface LogsFiltersProps {
  providers: string[]
  users: string[]
  serviceTypes: string[]
  filters: {
    provider?: string
    user?: string
    service?: string
  }
  onFiltersChange: (filters: { provider?: string; user?: string; service?: string }) => void
}

export function LogsFilters({
  providers,
  users,
  serviceTypes,
  filters,
  onFiltersChange,
}: LogsFiltersProps) {
  const hasActiveFilters = filters.provider || filters.user || filters.service

  const handleClearFilters = () => {
    onFiltersChange({})
  }

  return (
    <div className="flex gap-3 items-center">
      <div className="w-[180px]">
        <Select
          value={filters.provider ?? "all"}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, provider: value === "all" ? undefined : value })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="选择提供商" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有提供商</SelectItem>
            {providers.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-[180px]">
        <Select
          value={filters.user ?? "all"}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, user: value === "all" ? undefined : value })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="选择用户" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有用户</SelectItem>
            {users.map((user) => (
              <SelectItem key={user} value={user}>
                {user}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-[180px]">
        <Select
          value={filters.service ?? "all"}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, service: value === "all" ? undefined : value })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="选择服务" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有服务</SelectItem>
            {serviceTypes.map((service) => (
              <SelectItem key={service} value={service}>
                {service}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-9">
          <X className="h-4 w-4 mr-1" />
          清除
        </Button>
      )}
    </div>
  )
}
