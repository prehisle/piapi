"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to login by default
    router.push("/login")
  }, [router])

  return null
}
