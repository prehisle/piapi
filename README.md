# piapi ![CI](https://github.com/prehisle/piapi/actions/workflows/ci.yml/badge.svg)

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
      - type: codex
        baseUrl: https://api.provider-alpha.com/v1/engines
        auth:
          mode: header
          name: Authorization
          prefix: "Bearer "
      - type: claude_code
        baseUrl: https://api.provider-alpha.com/v1/claude
        auth:
          mode: header
          name: x-api-key
  - name: provider-beta
    apiKeys:
      prod-key: sk-beta-yyy
    services:
      - type: codex
        baseUrl: https://api.provider-beta.com/codex
        auth:
          mode: query
          name: api_key

users:
  - name: Alice
    apiKey: piapi-user-alice
    services:
      codex:
        providerName: provider-alpha
        providerKeyName: main-key
      claude_code:
        providerName: provider-alpha
        providerKeyName: main-key
  - name: Bob
    apiKey: piapi-user-bob
    services:
      codex:
        providerName: provider-alpha
        providerKeyName: backup-key
  - name: Carol
    apiKey: piapi-user-carol
    services:
      codex:
        providerName: provider-beta
        providerKeyName: prod-key
```

默认情况下，`/piapi/<service_type>/<rest>` 的 `<rest>` 会被原样追加到相应 service 的 `baseUrl` 后面；若 `auth` 未显式配置，则自动使用 `Authorization: Bearer <providerKey>`。自 0.2.0 起，用户级路由改为“用户 + 服务类型”粒度，可像示例一样为同一用户的 `codex`、`claude_code` 分别指定不同的上游。

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
  http://localhost:9200/piapi/codex/completions
```

### 2.1 使用 Docker Compose

仓库包含 `docker-compose.yml`，默认从 `ghcr.io/prehisle/piapi:main` 拉取镜像并启动：

```bash
docker compose pull
docker compose up -d
```

默认映射主机 `./config.yaml` 到容器 `/app/config.yaml`，启动后即监听 `9200` 端口；修改本地配置并保存可触发容器内的热加载。

> 如果你希望基于本地源码构建镜像，可临时编辑 `docker-compose.yml`，取消 `image` 并恢复 `build: .` 配置，然后运行 `docker compose up --build`。

### 2.2 从 GHCR 获取镜像

GitHub Actions 会在推送到 `main` 或创建符合 `v*` 模式的标签时，自动将容器镜像发布到 `ghcr.io/prehisle/piapi`。

```bash
docker pull ghcr.io/prehisle/piapi:main    # 主分支镜像
docker pull ghcr.io/prehisle/piapi:v1.0.0  # 版本标签镜像

docker run --rm \
  -p 9200:9200 \
  -v "$(pwd)/config.yaml:/app/config.yaml:ro" \
  ghcr.io/prehisle/piapi:main --listen :9200
```

默认凭据使用仓库的 `GITHUB_TOKEN`，无需额外配置；如需跨仓库或组织推送，可改用拥有 `packages:write` 权限的 PAT。

### 3. 热加载配置

服务会通过 fsnotify 监听 `config.yaml`。修改文件并保存后，通过 log/sugar 或日志管线可看到 `config reloaded` 日志，同时对外请求立即生效。若新配置校验失败，旧配置会继续服务，Prometheus 指标 `piapi_config_reloads_total{result="failure"}` 会增加。

### 4. 观测与监控

* **健康检查**: `GET /healthz`
* **指标**: `GET /metrics` (Prometheus 格式)
  * `piapi_requests_total{service_type="codex",status_class="2xx"}`
  * `piapi_request_latency_seconds_bucket{service_type="claude_code",...}`
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

## 持续集成

仓库默认集成 GitHub Actions，在 `.github/workflows/ci.yml` 中定义。

当推送到 `main` 或创建 PR 时会自动执行 `go test ./...` 与 `go build ./cmd/piapi`，确保核心逻辑在合并前通过编译与测试。徽章与镜像路径已指向 `prehisle/piapi`，如迁移仓库请同步更新相应链接。

> 注意：为了允许工作流推送镜像到 GHCR，请在仓库或组织的 `Settings -> Actions -> General` 中将 Workflow permissions 设置为 “Read and write permissions”。

## 发布清单

在对外发布或创建新的 Git Tag 之前，请确认以下事项：

- [x] 更新 `config.yaml.example`，确保覆盖所有新增字段。
- [x] `go test ./...` 全部通过。
- [ ] CI 工作流状态为绿色。
- [x] README 徽章与镜像路径已指向当前仓库。
- [x] README 中的 GHCR 镜像路径已替换为实际仓库并验证可用。
- [x] 若有配置变更，更新 `docs/最终规格说明与实施规划.md` 并与 README 保持一致。
- [ ] 镜像构建验证通过：`docker build -t piapi-gateway:latest .`。
- [ ] （可选）在 Release 说明中记录主要变更与兼容性提醒。

### 发布流程示例

```bash
# 更新版本号、生成变更说明后创建标签
git tag -a v1.0.0 -m "piapi v1.0.0"
git push origin v1.0.0

# GitHub Actions 将自动：
# 1. 运行测试
# 2. 构建并推送 ghcr.io/prehisle/piapi:v1.0.0
# 3. 推送 ghcr.io/prehisle/piapi:sha-<commit> 等辅助标签
```
