# 贡献者指南

本文整合了原 `AGENTS.md`、`CLAUDE.md` 的信息，集中说明仓库结构、开发流程与协作约定，便于人工与智能协作者统一遵循。

## 仓库结构速览

- `cmd/piapi`：服务入口，解析 `--config`、`--listen`，装配日志、配置管理、HTTP 路由与 Admin 组件。
- `internal/config`：配置模型、解析校验、聚合路由策略与热加载 watcher。
- `internal/server`：网关与中间件，负责 `/piapi/<service>` 反向代理、认证与请求日志。
- `internal/adminapi`：`/piadmin/api/*` 管理接口，支持配置读写、运行时路由状态及仪表盘数据。
- `internal/adminui`：嵌入式静态资源服务；通过 `web/admin` 构建 Next.js 导出的 SPA。
- `internal/logging`、`internal/metrics`：zap JSON 日志与 Prometheus 指标。
- `docs/`：方案、规格与归档资料；`docs/changelog/` 存放按日期划分的变更记录，`docs/archive/` 保存阶段性设计稿。

## 常用命令

### Go 服务
- `go run ./cmd/piapi --config config.yaml --listen :9200`：本地验证配置与路由。
- `make build` / `make build-skip-admin`：生成 `bin/piapi`（后者跳过前端构建）。
- `make run CONFIG=config.dev.yaml LISTEN_ADDR=:9300`：编译后以自定义参数运行。
- `go test ./...` 或 `go test -run TestConfig ./internal/config`：全量/定向测试。
- `make dev-backend`：使用 Air 热重载后端，默认读取 `config.dev.yaml`。

### Admin UI
- `make admin-install` / `make admin-build`：安装依赖并构建前端静态资源。
- `make dev-frontend`：在 `web/admin` 下启动 Next.js (basePath `/piadmin`)，代理 `/piadmin/api/*` 到后端。
- `PIAPI_ADMIN_TOKEN=piapi ./bin/piapi ...`：启用 `/piadmin` UI 与 `/piadmin/api`。

### Docker / CI
- `make docker-build`：构建多阶段镜像（Node → Go → distroless）。
- `docker compose up -d`：本地栈，挂载宿主 `config.yaml`（确保 UID 65532 可写）。
- CI 通过上传前端构建产物、复用 Go/镜像缓存加速，详情见 `docs/archive/CI_OPTIMIZATION_SUMMARY.md`。

## 编码与提交规范

- 使用 Go 1.23，提交前执行 `gofmt`、`goimports`；若新增 lint，可在 CI 中统一执行。
- 包名小写单词，导出符号驼峰；接口命名尽量动宾式（如 `ProxyHandler`）。
- 结构体字段与 JSON/YAML 标签对齐业务语义；新增日志字段需确认 JSON 输出链路兼容。
- 复杂回退/容错逻辑可添加简短注释，避免难以维护。
- 提交信息使用祈使语气：`Add admin dashboard stats API`，正文说明影响/风险/回滚方案。

## 测试约定

- 表驱动 + `t.Run` 区分成功/失败/边界场景，关键路径保持 70% 以上覆盖。
- 新增指标或日志字段时，成功与失败场景各补一条断言。
- 默认运行 `go test ./...`；前端涉及关键逻辑可添加脚本（示例：`web/admin/scripts/test-key-rename.mjs`）。

## 安全与配置

- 禁止提交真实密钥；本地调试使用 `.env` 或 CI 管理的密钥。
- 新增配置字段必须更新 `config.yaml.example`，并确认热加载日志出现 `config reloaded`。
- Docker 运行默认 UID 65532，确保挂载配置文件权限满足读写。
- 管理后台使用 `PIAPI_ADMIN_TOKEN` 单一 Bearer 令牌；生产可再加防火墙/IP 白名单。

## 管理后台与请求链路概览

1. 客户端向 `/piapi/<service_type>/...` 发起请求，携带用户 API Key。
2. 网关解析路径与 `Authorization`，调用 `config.Manager.Resolve` 获取上游 Provider/Key/BaseURL。
3. `httputil.ReverseProxy` 负责改写路径、附加头/Query 认证，返回响应并记录指标与日志。
4. `internal/logging.GlobalRequestLogStore` 收集请求日志，Admin UI 通过 `/piadmin/api/dashboard/*` 查询。
5. Admin API 允许读取/写入 `config.yaml`，写入流程包含备份、校验、失败回滚。
6. Admin UI 采用 Next.js 静态导出，构建产物嵌入 Go 二进制并由 `adminui` handler 提供 SPA 路由。

## 与协作者的沟通约定

- 所有对话、文档更新以中文为准，保持术语统一。
- AI 协作者需遵循本指南，提交前避免使用破坏性 git 命令（如 `reset --hard`）。
- 若遇到未知文件改动或配置缺失，请先向仓库维护者确认后再处理。

## 进一步阅读

- 架构、路由策略等详细设计见 `docs/01~05` 系列。
- 变更记录：`docs/changelog/`（例如 `docs/changelog/2025-11-03.md`）。
- 历史专题/会议记录：`docs/archive/`（例如 API Key 编辑方案、CI 优化说明等）。
