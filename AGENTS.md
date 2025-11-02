# Repository Guidelines（仓库协作指南）

## 项目结构与模块组织
服务入口位于 `cmd/piapi`，负责解析启动参数、装载配置并初始化依赖。核心逻辑分布在 `internal/*`：`internal/config` 负责配置解析、校验、热加载与错误回退，`internal/server` 组织 HTTP 路由、认证中间件和上游转发流程，`internal/proxy` 封装上游请求、重试与追踪字段，`internal/logging` 提供 zap 日志包装，`internal/metrics` 注册 Prometheus 指标并暴露采样端点。发布说明、集成方案与流程文档集中在 `docs/`，若新增模块请同步补充目录说明，并在 README 保持结构同步。运行时需要的 `config.yaml` 可参考 `config.yaml.example`，不同环境可通过副本文件（如 `config.staging.yaml`）差异化配置，同时借助 `docker-compose.yml` 挂载对应配置进行演练。

## 构建、测试与开发命令
- `go run ./cmd/piapi --config config.yaml --listen :9200`：本地直接启动网关以验证配置与路由行为。
- `make build`：依据当前 GOOS/GOARCH 编译并输出 `bin/piapi`，适用于本地或 CI 制品，可通过 `BINARY=./bin/piapi-linux` 定制目标路径。
- `make run CONFIG=config.dev.yaml`：重新构建并以自定义配置/监听地址启动，可配合 `LISTEN_ADDR=:9300` 调试多实例。
- `make test`：执行 `go test ./...` 覆盖所有包，建议搭配 `go test -run TestConfig ./internal/config` 复核单个模块。
- `make docker-build`：构建 `piapi-gateway:latest` 镜像；如需验证仓库镜像，可先 `docker compose pull` 再 `docker compose up -d`，必要时执行 `docker logs piapi` 排查启动。
- `make clean`：清理 `bin/` 目录内的产物，避免旧二进制残留造成调试误判。
- `docker run --rm -p 9200:9200 -v $(pwd)/config.yaml:/app/config.yaml ghcr.io/prehisle/piapi:main`：验证线上镜像与当前配置的兼容性。

## 代码风格与命名约定
使用 Go 1.23 工具链并保持 gofmt 清洁，提交前运行 `gofmt -w` 或启用编辑器自动格式化；必要时执行 `go vet ./...` 捕捉潜在问题。若编辑器支持，请启用 `goimports` 自动整理依赖，保持导入顺序一致。包名采用简洁的小写单词（如 `server`、`metrics`），导出类型与函数沿用 Go 的驼峰命名，接口命名保持行动导向，如 `ProxyHandler`。结构体字段应清晰映射业务语义，例如 `providerName`、`serviceType`，避免含糊缩写，并保持 JSON 标签与配置键一致。示例配置须使用 `sk-` 前缀等假数据，避免泄露真实凭据，并在注释中说明敏感字段处理方式；涉及第三方域名时请标注占位说明。

## 测试指引
测试文件统一放在与源码同级的 `*_test.go` 中，新增路由或代理逻辑时优先采用表驱动用例，覆盖正常、异常与边界输入。每次修改请求转发、认证校验或文件监听逻辑后执行 `go test ./...`；CI 会复用同一命令并阻止未通过的提交。新增指标或日志字段时，应为成功和失败场景各增一条断言，防止回归；若引入新的监控标签，请评估指标基数并在 PR 中注明影响。需要压测或集成测试时，可在 `docs/` 目录登记方案，确保团队了解额外依赖，并考虑使用 `hey` 或 `vegeta` 等工具记录过程。默认不强制覆盖率阈值，但建议保持核心包覆盖率 >70%，以便监测回退趋势。

## 提交与拉取请求规范
保持单一职责的提交，提交信息使用祈使语句与句首大写风格，例如 `Upgrade Go toolchain to 1.23`。当行为或配置发生变更时，在提交正文说明影响面与回滚方式。创建 PR 时需概述改动、关联相关 Issue，并注明配置/部署上的跟进事项（例如同步更新 `config.yaml.example` 或提供仪表盘截图）。若调整 HTTP 行为，请附上 `curl` 结果或请求追踪，便于审阅；涉及指标或日志格式的改动应提供样例输出。

## 配置与安全提示
严禁提交真实上游密钥，可使用本地 `.env` 或 CI/CD 密钥管理。新增配置字段时同步更新 `config.yaml.example` 并验证默认值，修改后通过日志确认出现 `config reloaded` 信息再发起合并。若需共享调试数据，请先删除敏感字段，并在 Issue 记录受影响的 provider 与环境。部署前务必核对 Prometheus 端点与健康检查是否在目标环境可访问，并复查防火墙/Ingress 配置是否允许所需端口；涉及外部依赖的变更需在发布前完成回滚演练。

## 架构与运维建议
网关默认以反向代理模式透传请求，若上游 SLA 高，可在 `internal/proxy` 扩展超时与重试策略。Prometheus 指标 `piapi_requests_total` 和 `piapi_request_latency_seconds` 可用于告警阈值设定；建议在引入新 service type 时同步补充 Dashboard 说明，并更新团队告警手册。日志默认输出 JSON，若需对接集中化链路，请评估字段兼容性并更新 `internal/logging` 注释，同时确认 Request ID 贯穿上下游链路。

## 沟通约定
所有协作与反馈请统一使用中文描述，确保讨论语境一致并便于追溯记录。紧急问题建议在 Issue 中 @ 相关维护者，同时同步到团队沟通频道，必要时附上日志片段或复现步骤以加速定位。若跨时区协作，请标注可响应时间段，避免误判优先级；会议或结论需回填到对应 Issue 保留文本记录。
