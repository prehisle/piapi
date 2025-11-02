"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"

interface AuthContextType {
  isAuthenticated: boolean
  login: (password: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("admin_auth")
    if (stored === "true") {
      setIsAuthenticated(true)
    }
    setIsHydrated(true)
  }, [])

  const login = (password: string): boolean => {
    // Simple admin authentication - in production, validate against backend
    if (password === "admin123") {
      setIsAuthenticated(true)
      localStorage.setItem("admin_auth", "true")
      return true
    }
    return false
  }

  const logout = () => {
    setIsAuthenticated(false)
    localStorage.removeItem("admin_auth")
  }

  // Avoid hydration mismatch by not rendering until hydrated
  if (!isHydrated) {
    return <>{children}</>
  }

  return <AuthContext.Provider value={{ isAuthenticated, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
