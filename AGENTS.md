# Repository Guidelines

## Project Structure & Module Organization
服务入口位于 `cmd/piapi`，负责解析启动参数、装载配置并初始化依赖；业务逻辑拆分于 `internal/`，其中 `internal/config` 负责配置解析与热加载，`internal/server` 管理 HTTP 路由与认证，`internal/proxy` 处理上游调用，`internal/logging` 和 `internal/metrics` 提供日志与指标支持。测试文件以 `*_test.go` 与源码同级放置，流程文档与环境说明集中在 `docs/`。示例配置 `config.yaml.example` 可按环境派生副本，`docker-compose.yml` 用于本地挂载与调试。

## Build, Test, and Development Commands
- `go run ./cmd/piapi --config config.yaml --listen :9200`：快速验证配置与路由。
- `make build`：生成 `bin/piapi`，可通过 `BINARY=./bin/piapi-linux` 指定目标文件。
- `make run CONFIG=config.dev.yaml LISTEN_ADDR=:9300`：重建并以自定义配置运行，适合模拟多实例。
- `make test` 或 `go test -run TestConfig ./internal/config`：全量或定向执行单包测试。
- `make docker-build` 与 `docker compose up -d`：构建并启动本地栈，借助 `docker logs piapi` 观察启动日志。

## Coding Style & Naming Conventions
采用 Go 1.23 工具链，提交前执行 `gofmt` 与 `goimports`，保持导入顺序与缩进一致。包名使用小写单词，导出类型与函数使用驼峰命名，接口多用动宾式（如 `ProxyHandler`）。结构体字段应直接映射业务语义，并让 JSON 标签与配置键保持一致。新增日志字段需确保与现有 JSON 输出链路兼容，复杂逻辑可加简短注释说明回退策略。

## Testing Guidelines
默认使用 Go testing 与表驱动方式覆盖成功、失败与边界场景；子用例通过 `t.Run` 区分输入。关键路径维持 70% 以上覆盖率，并结合上下游 mock 隔离外部依赖。新增指标或日志字段时，为成功与失败各补一条断言。提交前运行 `go test ./...`，并在失败用例中注明触发条件。

## Commit & Pull Request Guidelines
保持单一职责提交，提交信息使用祈使语气（示例：`Upgrade Go toolchain to 1.23`），正文补充影响面、风险与回滚策略。PR 描述需概述改动、关联 Issue，并列出部署后续（如更新 `config.yaml.example`、附 `curl` 结果或日志片段）。若改动涉及指标或日志格式，应提供样例输出与仪表盘影响说明。

## Security & Configuration Tips
禁止提交真实密钥，改用本地 `.env` 或 CI 密钥管理。新增配置字段时同步更新 `config.yaml.example`，并在启动日志确认出现 `config reloaded` 验证热加载。使用 `docker run --rm -p 9200:9200 -v $(pwd)/config.yaml:/app/config.yaml ghcr.io/prehisle/piapi:main` 校验线上镜像兼容性。共享调试日志前需脱敏，并标注受影响的 provider 与环境，便于追踪。

## 交互语言要求
与用户交流时须全程使用中文，包括解释、总结与确认信息等所有互动环节。
