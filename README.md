# piapi

piapi 是一个面向小型开发团队的极简 LLM 编码助手网关。它提供统一的 `/piapi/<service_type>` 接口，将请求安全地转发到配置文件中声明的上游服务，并支持热加载、结构化日志与 Prometheus 监控指标。

## 目录结构

```
cmd/piapi        # 主程序入口
internal/config # 配置解析、校验、热加载逻辑
internal/server # HTTP 网关、代理与中间件
internal/logging# zap 日志封装
internal/metrics# Prometheus 指标注册
```

## 快速开始

### 1. 准备配置文件

在项目根目录创建 `config.yaml`，或复制下面的模板：

```yaml
# config.yaml.example
providers:
  - name: provider-alpha
    apiKeys:
      main-key: sk-alpha-xxx
      backup-key: sk-alpha-backup
    services:
      - type: cx
        baseUrl: https://api.provider-alpha.com/v1/engines
        auth:
          mode: header
          name: Authorization
          prefix: "Bearer "
      - type: cc
        baseUrl: https://api.provider-alpha.com/v1/claude
        auth:
          mode: header
          name: x-api-key
  - name: provider-beta
    apiKeys:
      prod-key: sk-beta-yyy
    services:
      - type: cx
        baseUrl: https://api.provider-beta.com/codex
        auth:
          mode: query
          name: api_key

users:
  - name: Alice
    apiKey: piapi-user-alice
    providerName: provider-alpha
    providerKeyName: main-key
  - name: Bob
    apiKey: piapi-user-bob
    providerName: provider-alpha
    providerKeyName: backup-key
  - name: Carol
    apiKey: piapi-user-carol
    providerName: provider-beta
    providerKeyName: prod-key
```

默认情况下，`/piapi/<service_type>/<rest>` 的 `<rest>` 会被原样追加到相应 service 的 `baseUrl` 后面；若 `auth` 未显式配置，则自动使用 `Authorization: Bearer <providerKey>`。

### 2. 运行服务

```bash
go run ./cmd/piapi --config config.yaml --listen :9200
```

成功后，可以使用 curl 或任意 HTTP 客户端调用：

```bash
curl -X POST \
  -H 'Authorization: Bearer piapi-user-alice' \
  -H 'Content-Type: application/json' \
  --data '{"prompt":"..."}' \
  http://localhost:9200/piapi/cx/completions
```

### 2.1 使用 Docker Compose

仓库包含 `Dockerfile` 与 `docker-compose.yml`，可直接构建并启动：

```bash
docker compose up --build
```

默认映射主机 `./config.yaml` 到容器 `/app/config.yaml`，启动后即监听 `9200` 端口；修改本地配置并保存可触发容器内的热加载。

### 3. 热加载配置

服务会通过 fsnotify 监听 `config.yaml`。修改文件并保存后，通过 log/sugar 或日志管线可看到 `config reloaded` 日志，同时对外请求立即生效。若新配置校验失败，旧配置会继续服务，Prometheus 指标 `piapi_config_reloads_total{result="failure"}` 会增加。

### 4. 观测与监控

* **健康检查**: `GET /healthz`
* **指标**: `GET /metrics` (Prometheus 格式)
  * `piapi_requests_total{service_type="cx",status_class="2xx"}`
  * `piapi_request_latency_seconds_bucket{service_type="cc",...}`
  * `piapi_config_reloads_total{result="success"}`
* **结构化日志**: 使用 zap JSON 输出，字段包含 `request_id`, `user`, `service_type`, `upstream_provider` 等。

## 构建与测试

```bash
go test ./...
go build ./cmd/piapi
```

构建容器镜像：

```bash
docker build -t piapi-gateway:latest .
```

## 系统假设

* 服务运行在可信内部网络，仅依赖 API Key 认证。
* 每个用户必须在配置中绑定到具体 provider 与命名密钥。
* 当前版本尚未实现多租户速率限制或请求审计，若有需要可在代理层增加中间件。

## 下一步

* 补充更丰富的集成测试与负载测试脚本。
* 在 Dockerfile 与部署脚本中封装运行环境（见待完成的实施规划 Phase 4）。
```
