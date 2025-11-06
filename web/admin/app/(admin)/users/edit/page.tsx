"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { withBasePath } from "@/lib/base-path"

export default function EditUserPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace(withBasePath("/users"))
  }, [router])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(withBasePath("/users"))}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          返回用户列表
        </Button>
        <h1 className="text-3xl font-bold">用户编辑入口已合并至列表页</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        现在可以直接在 Users 列表中查看运行时状态并调整候选上游，无需跳转到单独页面。
      </p>
    </div>
  )
}
