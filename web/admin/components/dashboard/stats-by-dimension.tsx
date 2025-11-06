"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { DashboardStats } from "@/lib/api"

interface StatsByDimensionProps {
  stats?: DashboardStats
  dimension: "all" | "provider" | "user" | "service"
  isLoading: boolean
}

export function StatsByDimension({ stats, dimension, isLoading }: StatsByDimensionProps) {
  if (isLoading || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>统计详情</CardTitle>
          <CardDescription>按维度查看详细统计数据</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Overall stats for "all" dimension
  if (dimension === "all") {
    const rs = stats.request_stats
    const totalRequests = rs?.total_requests ?? 0
    const successRate = rs?.success_rate ?? 0
    const errorCount = rs?.error_count ?? 0
    const avgLatency = rs?.avg_latency_ms ?? 0

    return (
      <Card>
        <CardHeader>
          <CardTitle>总体统计</CardTitle>
          <CardDescription>所有请求的汇总数据</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">总请求数</p>
              <p className="text-2xl font-bold">{totalRequests}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">成功率</p>
              <p className="text-2xl font-bold text-green-600">
                {successRate.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">错误数</p>
              <p className="text-2xl font-bold text-red-600">{errorCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">平均延迟</p>
              <p className="text-2xl font-bold">{Math.round(avgLatency)}ms</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Get data based on dimension
  const getDimensionData = () => {
    if (dimension === "provider") {
      return {
        title: "按服务商统计",
        description: "各服务商的请求统计数据",
        data: stats.request_stats?.by_provider ?? {},
      }
    } else if (dimension === "user") {
      return {
        title: "按用户统计",
        description: "各用户的请求统计数据",
        data: stats.request_stats?.by_user ?? {},
      }
    } else {
      return {
        title: "按服务统计",
        description: "各服务类型的请求统计数据",
        data: stats.request_stats?.by_service ?? {},
      }
    }
  }

  const { title, description, data } = getDimensionData()

  // Convert data to array for table display
  const tableData = Object.entries(data || {}).map(([name, stats]) => {
    const total = stats.total || 0
    const success = stats.success || 0
    const error = stats.error || 0
    const successRate = total > 0 ? (success / total) * 100 : 0

    return {
      name,
      total,
      success,
      error,
      successRate,
    }
  })

  // Sort by total requests (descending)
  tableData.sort((a, b) => b.total - a.total)

  if (tableData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">暂无数据</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">名称</TableHead>
                <TableHead className="text-right">总请求数</TableHead>
                <TableHead className="text-right">成功次数</TableHead>
                <TableHead className="text-right">错误次数</TableHead>
                <TableHead className="text-right">成功率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right font-mono">{row.total}</TableCell>
                  <TableCell className="text-right font-mono text-green-600">
                    {row.success}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    {row.error}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      className={
                        row.successRate >= 95
                          ? "bg-green-500/10 text-green-700 hover:bg-green-500/20"
                          : row.successRate >= 80
                          ? "bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20"
                          : "bg-red-500/10 text-red-700 hover:bg-red-500/20"
                      }
                    >
                      {row.successRate.toFixed(1)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
