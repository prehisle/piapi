"use client"

import { useState } from "react"
import type { Service } from "@/hooks/use-services"
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
import { Trash2, Plus } from "lucide-react"

interface ServicesTableProps {
  services: Service[]
  onAdd: (service: Service) => void
  onUpdate: (index: number, service: Service) => void
  onDelete: (index: number) => void
}

export function ServicesTable({ services, onAdd, onUpdate, onDelete }: ServicesTableProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [formData, setFormData] = useState<Service>({ name: "", type_id: "", auth_type: "" })

  const handleOpenDialog = (index?: number) => {
    if (index !== undefined) {
      setFormData(services[index])
      setEditingIndex(index)
    } else {
      setFormData({ name: "", type_id: "", auth_type: "" })
      setEditingIndex(null)
    }
  }

  const handleSave = () => {
    if (!formData.name || !formData.type_id || !formData.auth_type) {
      return
    }

    if (editingIndex !== null) {
      onUpdate(editingIndex, formData)
    } else {
      onAdd(formData)
    }

    setEditingIndex(null)
    setFormData({ name: "", type_id: "", auth_type: "" })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Services</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage service types</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Service
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingIndex !== null ? "Edit Service" : "Add Service"}</DialogTitle>
              <DialogDescription>
                {editingIndex !== null ? "Update the service details" : "Create a new service type"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Service Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., OpenAI API"
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Type ID</label>
                <Input
                  value={formData.type_id}
                  onChange={(e) => setFormData({ ...formData, type_id: e.target.value })}
                  placeholder="e.g., llm"
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Auth Type</label>
                <Input
                  value={formData.auth_type}
                  onChange={(e) => setFormData({ ...formData, auth_type: e.target.value })}
                  placeholder="e.g., api_key"
                  className="mt-2"
                />
              </div>
              <Button onClick={handleSave} className="w-full">
                {editingIndex !== null ? "Update" : "Create"}
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
              <th className="px-6 py-3 text-left font-medium">Service Name</th>
              <th className="px-6 py-3 text-left font-medium">Type ID</th>
              <th className="px-6 py-3 text-left font-medium">Auth Type</th>
              <th className="px-6 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service, index) => (
              <tr key={index} className="border-b border-border hover:bg-secondary/30 transition-colors">
                <td className="px-6 py-4">{service.name}</td>
                <td className="px-6 py-4">{service.type_id}</td>
                <td className="px-6 py-4">{service.auth_type}</td>
                <td className="px-6 py-4 text-right space-x-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => handleOpenDialog(index)}>
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Service</DialogTitle>
                        <DialogDescription>Update the service details</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Service Name</label>
                          <Input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g., OpenAI API"
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Type ID</label>
                          <Input
                            value={formData.type_id}
                            onChange={(e) => setFormData({ ...formData, type_id: e.target.value })}
                            placeholder="e.g., llm"
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Auth Type</label>
                          <Input
                            value={formData.auth_type}
                            onChange={(e) => setFormData({ ...formData, auth_type: e.target.value })}
                            placeholder="e.g., api_key"
                            className="mt-2"
                          />
                        </div>
                        <Button onClick={handleSave} className="w-full">
                          Update
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

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
                        <AlertDialogTitle>Delete Service</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{service.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="flex justify-end gap-3">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDelete(index)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </div>
                    </AlertDialogContent>
                  </AlertDialog>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {services.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No services yet. Create one to get started.</p>
        </div>
      )}
    </div>
  )
}
