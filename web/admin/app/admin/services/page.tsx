"use client"

import { useServices } from "@/hooks/use-services"
import { ServicesTable } from "@/components/services/services-table"

export default function ServicesPage() {
  const { services, addService, updateService, deleteService } = useServices()

  return (
    <div className="space-y-6">
      <ServicesTable services={services} onAdd={addService} onUpdate={updateService} onDelete={deleteService} />
    </div>
  )
}
