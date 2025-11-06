"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface StatsDimensionSelectorProps {
  providers: string[]
  users: string[]
  serviceTypes: string[]
  selectedProvider?: string
  selectedUser?: string
  selectedService?: string
  onProviderChange: (value?: string) => void
  onUserChange: (value?: string) => void
  onServiceChange: (value?: string) => void
}

export function StatsDimensionSelector({
  providers,
  users,
  serviceTypes,
  selectedProvider,
  selectedUser,
  selectedService,
  onProviderChange,
  onUserChange,
  onServiceChange,
}: StatsDimensionSelectorProps) {
  return (
    <div className="flex gap-3 items-center">
      <div className="w-[180px]">
        <Select
          value={selectedProvider ?? "all"}
          onValueChange={(value) => onProviderChange(value === "all" ? undefined : value)}
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
          value={selectedUser ?? "all"}
          onValueChange={(value) => onUserChange(value === "all" ? undefined : value)}
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
          value={selectedService ?? "all"}
          onValueChange={(value) => onServiceChange(value === "all" ? undefined : value)}
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
    </div>
  )
}
