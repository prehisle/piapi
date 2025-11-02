"use client"

import { useState } from "react"
import Link from "next/link"
import type { User } from "@/hooks/use-users"
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
  onAdd: (user: User) => void
  onDelete: (name: string) => void
}

export function UsersTable({ users, onAdd, onDelete }: UsersTableProps) {
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState({ name: "", api_key: "" })

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

  const handleSave = () => {
    if (!formData.name.trim() || !formData.api_key.trim()) return
    onAdd(formData)
    setFormData({ name: "", api_key: "" })
    setIsOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Users</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage API users and their configurations</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., user1"
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">API Key</label>
                <Input
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="e.g., sk_live_..."
                  className="mt-2"
                />
              </div>
              <Button onClick={handleSave} className="w-full">
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
              return (
                <tr key={user.name} className="border-b border-border hover:bg-secondary/30 transition-colors">
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
                      <button
                        onClick={() => copyToClipboard(user.api_key)}
                        className="p-1 hover:bg-secondary/50 rounded-sm transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link href={`/admin/users/edit?name=${encodeURIComponent(user.name)}`}>
                      <Button variant="outline" size="sm">
                        Configure Routes
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
                          <AlertDialogTitle>Delete User</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete user "{user.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="flex justify-end gap-3">
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDelete(user.name)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </div>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
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
