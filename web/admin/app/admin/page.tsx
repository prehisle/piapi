"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Welcome to the Piapi Admin Panel</p>
      </div>

      {/* Dashboard cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <p className="text-xs text-muted-foreground mt-2">Manage service types</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Providers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <p className="text-xs text-muted-foreground mt-2">Active service providers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <p className="text-xs text-muted-foreground mt-2">Registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Routes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <p className="text-xs text-muted-foreground mt-2">Total routing policies</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
          <CardDescription>Navigate to key management pages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a href="/admin/services" className="p-4 border border-border rounded-sm hover:bg-accent transition-colors">
              <h3 className="font-medium">Manage Services</h3>
              <p className="text-sm text-muted-foreground mt-1">Add, edit, or remove service types</p>
            </a>
            <a
              href="/admin/providers"
              className="p-4 border border-border rounded-sm hover:bg-accent transition-colors"
            >
              <h3 className="font-medium">Manage Providers</h3>
              <p className="text-sm text-muted-foreground mt-1">Configure service providers</p>
            </a>
            <a href="/admin/users" className="p-4 border border-border rounded-sm hover:bg-accent transition-colors">
              <h3 className="font-medium">Manage Users</h3>
              <p className="text-sm text-muted-foreground mt-1">View and configure user routing</p>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
