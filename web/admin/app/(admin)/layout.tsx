"use client"

import { type ReactNode, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { withBasePath } from "@/lib/base-path"

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("admin_auth")
    if (stored === "true") {
      setIsAuthenticated(true)
    } else {
      router.push(withBasePath("/login"))
    }
    setIsReady(true)
  }, [router])

  if (!isReady || !isAuthenticated) {
    return null
  }

  const handleLogout = () => {
    localStorage.removeItem("admin_auth")
    router.push(withBasePath("/login"))
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold">Piapi Admin</h1>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
