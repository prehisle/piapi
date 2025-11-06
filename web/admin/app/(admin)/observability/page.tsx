"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export default function ObservabilityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Observability</h1>
        <p className="text-sm text-muted-foreground mt-1">
          快速了解如何获取运行时统计、Prometheus 指标以及日志数据。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>候选健康统计</CardTitle>
          <CardDescription>通过后端 Admin API 获取每个用户/服务的候选运行状态。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            UI 中的用户详情页会调用 <code className="bg-secondary/50 px-1 py-0.5 rounded-sm">GET /piadmin/api/stats/routes</code>
            ，你也可以手动查询：
          </p>
          <pre className="bg-muted/50 p-4 rounded-sm text-xs overflow-auto">
            <code>{`curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "http://<host>:9200/piadmin/api/stats/routes?apiKey=<user_api_key>&service=<service_type>"`}</code>
          </pre>
          <p>返回结果包含每个候选的请求数、错误数、错误率、最后一次错误信息以及当前健康状态。</p>
          <p>
            当路由策略使用 <code>adaptive_rr</code> 或 <code>sticky_healthy</code> 时，响应还会附带：
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <code>smoothed_error_rate</code>：使用指数滑动窗口计算的错误率，用于评估上游近期质量。
            </li>
            <li>
              <code>effective_weight</code>：实际参与调度的权重。对于 <code>adaptive_rr</code>，它会随质量动态变化。
            </li>
          </ul>
          <p>
            默认情况下窗口半衰期为 60s，可通过环境变量
            <code className="bg-secondary/50 px-1 py-0.5 rounded-sm">PIAPI_ADAPTIVE_HALFLIFE</code>、
            <code className="bg-secondary/50 px-1 py-0.5 rounded-sm">PIAPI_ADAPTIVE_QUALITY_FLOOR</code>
            进行调节。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prometheus 指标</CardTitle>
          <CardDescription>适用于 Dashboard / Alerting 的聚合指标。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>默认公开在 <code className="bg-secondary/50 px-1 py-0.5 rounded-sm">/metrics</code>，示例：</p>
          <pre className="bg-muted/50 p-4 rounded-sm text-xs overflow-auto">
            <code>{`curl http://<host>:9200/metrics | grep piapi_candidate`}</code>
          </pre>
          <ul className="list-disc list-inside space-y-1">
            <li><code>piapi_candidate_requests_total</code> / <code>piapi_candidate_errors_total</code>：按 service + provider 聚合。</li>
            <li><code>piapi_candidate_requests_by_key_total</code>：当设置环境变量 <code>PIAPI_METRICS_KEY_LABELS=true</code> 时，会额外按 key 打标签。</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>日志与排查</CardTitle>
          <CardDescription>保留结构化日志以追踪请求链路。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            后端采用 Zap JSON 日志，字段包括 <code>request_id</code>、<code>user</code>、<code>service_type</code>、<code>upstream_provider</code> 等。
            推荐将日志输出重定向到集中式平台或 <code>docker logs</code> 结合 <code>jq</code> 进行过滤：
          </p>
          <pre className="bg-muted/50 p-4 rounded-sm text-xs overflow-auto">
            <code>{`docker logs piapi | jq 'select(.service_type == "codex")'`}</code>
          </pre>
          <Separator />
          <p>
            若需要对接外部告警，可结合 Prometheus 指标或在 <code>/piadmin/api/stats/routes</code> 的数据上实现自定义巡检脚本。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
