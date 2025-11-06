"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { RequestLogEntry } from "@/lib/api"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"

interface LogsTableProps {
  logs: RequestLogEntry[]
  isLoading: boolean
}

function getStatusColor(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return "bg-green-500/10 text-green-700 hover:bg-green-500/20"
  if (statusCode >= 300 && statusCode < 400) return "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20"
  if (statusCode >= 400 && statusCode < 500) return "bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20"
  if (statusCode >= 500) return "bg-red-500/10 text-red-700 hover:bg-red-500/20"
  return "bg-gray-500/10 text-gray-700 hover:bg-gray-500/20"
}

function getLatencyColor(latencyMs: number): string {
  if (latencyMs < 500) return "text-green-600"
  if (latencyMs < 2000) return "text-yellow-600"
  return "text-red-600"
}

export function LogsTable({ logs, isLoading }: LogsTableProps) {
  if (isLoading) {
    return (
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>服务</TableHead>
              <TableHead>提供商</TableHead>
              <TableHead>路径</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">延迟</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded" /></TableCell>
                <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                <TableCell><div className="h-4 w-12 bg-muted animate-pulse rounded" /></TableCell>
                <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="border rounded-lg p-12 text-center text-muted-foreground">
        <p className="text-lg font-medium mb-1">暂无日志数据</p>
        <p className="text-sm">请等待请求到达或调整筛选条件</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">时间</TableHead>
            <TableHead className="w-[120px]">用户</TableHead>
            <TableHead className="w-[100px]">服务</TableHead>
            <TableHead className="w-[140px]">提供商</TableHead>
            <TableHead>路径</TableHead>
            <TableHead className="w-[80px]">状态</TableHead>
            <TableHead className="w-[100px] text-right">延迟</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.request_id}>
              <TableCell className="font-mono text-xs">
                {formatDistanceToNow(new Date(log.timestamp), {
                  addSuffix: true,
                  locale: zhCN,
                })}
              </TableCell>
              <TableCell className="font-medium">{log.user || "-"}</TableCell>
              <TableCell>
                <Badge variant="outline">{log.service_type}</Badge>
              </TableCell>
              <TableCell className="text-sm">{log.provider}</TableCell>
              <TableCell className="font-mono text-xs truncate max-w-[300px]" title={log.path}>
                {log.method} {log.path}
              </TableCell>
              <TableCell>
                <Badge className={getStatusColor(log.status_code)}>
                  {log.status_code || "-"}
                </Badge>
              </TableCell>
              <TableCell className={`text-right font-mono text-sm ${getLatencyColor(log.latency_ms)}`}>
                {log.latency_ms}ms
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
