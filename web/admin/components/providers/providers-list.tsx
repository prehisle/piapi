"use client"

import Link from "next/link"
import type { Provider } from "@/hooks/use-providers"
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

interface ProvidersListProps {
  providers: Provider[]
  onAdd: (provider: Provider) => void
  onDelete: (name: string) => void
}

export function ProvidersList({ providers, onAdd, onDelete }: ProvidersListProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState<Provider>({
    name: "",
    api_keys: [],
    services: [],
  })

  const handleSave = () => {
    if (!formData.name.trim()) return
    onAdd(formData)
    setFormData({ name: "", api_keys: [], services: [] })
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Provider</DialogTitle>
              <DialogDescription>Create a new service provider</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Provider Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Provider A"
                  className="mt-2"
                />
              </div>
              <Button onClick={handleSave} className="w-full">
                Create Provider
              </Button>
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
                          {typeof key === "object" && key.value ? key.value : String(key)}
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
                    provider.services.map((service, idx) => (
                      <span key={idx} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-sm">
                        {service}
                      </span>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No services</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Link href={`/admin/providers/edit?name=${encodeURIComponent(provider.name)}`} className="flex-1">
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
                        onClick={() => onDelete(provider.name)}
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
