"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Package, Users, UserCheck } from "lucide-react"

export function Sidebar() {
  const pathname = usePathname()

  const links = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/services", label: "Services", icon: Package },
    { href: "/admin/providers", label: "Providers", icon: Users },
    { href: "/admin/users", label: "Users", icon: UserCheck },
  ]

  return (
    <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-bold text-sidebar-foreground">Piapi</h2>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {links.map((link) => {
          const Icon = link.icon
          const isActive = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(link.href))

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <Icon className="w-5 h-5" />
              {link.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
