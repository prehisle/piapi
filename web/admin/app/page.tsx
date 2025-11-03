"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { withBasePath } from "@/lib/base-path"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to login by default
    router.push(withBasePath("/login"))
  }, [router])

  return null
}
