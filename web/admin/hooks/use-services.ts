"use client"

import { useState, useCallback } from "react"

export interface Service {
  name: string
  type_id: string
  auth_type: string
}

export function useServices() {
  const [services, setServices] = useState<Service[]>([
    { name: "OpenAI API", type_id: "llm", auth_type: "api_key" },
    { name: "Anthropic", type_id: "llm", auth_type: "api_key" },
    { name: "Stripe", type_id: "payment", auth_type: "api_key" },
  ])

  const addService = useCallback((service: Service) => {
    setServices((prev) => [...prev, service])
  }, [])

  const updateService = useCallback((index: number, service: Service) => {
    setServices((prev) => {
      const updated = [...prev]
      updated[index] = service
      return updated
    })
  }, [])

  const deleteService = useCallback((index: number) => {
    setServices((prev) => prev.filter((_, i) => i !== index))
  }, [])

  return { services, addService, updateService, deleteService }
}
