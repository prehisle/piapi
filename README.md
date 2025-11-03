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

仓库包含 `docker-compose.yml`，支持从远程镜像拉取或本地构建。默认使用本地构建模式。

**方式一：本地构建（推荐，包含最新修改）**

```bash
# 1. 创建环境变量文件启用管理界面（可选）
echo "PIAPI_ADMIN_TOKEN=$(openssl rand -base64 32)" > .env

# 2. 构建并启动
docker compose build
docker compose up -d

# 3. 查看生成的管理令牌
cat .env
```

**方式二：使用远程镜像**

编辑 `docker-compose.yml`，将 `build: .` 注释掉，启用 `image` 和 `pull_policy` 行：

```bash
docker compose pull
docker compose up -d
```

默认映射主机 `./config.yaml` 到容器 `/app/config.yaml`，启动后即监听 `9200` 端口；修改本地配置并保存可触发容器内的热加载。

**启用管理界面**：在 `.env` 文件中设置 `PIAPI_ADMIN_TOKEN` 后，访问 `http://localhost:9200/piadmin`。

**重要 - 文件权限**：

Docker 容器以非 root 用户（UID 65532）运行。如果使用 bind mount，需要确保 config.yaml 有正确的权限：

```bash
# 设置文件所有者为容器用户
sudo chown 65532:65532 config.yaml

# 或者给所有用户读写权限（不太安全）
chmod 666 config.yaml
```

否则通过管理界面更新配置时会出现 "permission denied" 错误。

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

### 5. 管理后台 API（MVP）

为了支撑管理后台 UI，服务内置了一个受保护的配置管理 API，默认关闭。设置环境变量 `PIAPI_ADMIN_TOKEN` 后生效：

```bash
PIAPI_ADMIN_TOKEN='super-secret-token' go run ./cmd/piapi --config config.yaml --listen :9200
```

所有管理接口都位于 `/piadmin/api` 下，并要求通过 `Authorization: Bearer <token>` 进行认证。当前提供以下操作：

* `GET /piadmin/api/config`：返回结构化 JSON 配置快照（与 `config.yaml` 字段一致）。
* `GET /piadmin/api/config/raw`：以 `application/x-yaml` 形式返回原始 `config.yaml` 内容。
* `PUT /piadmin/api/config/raw`：提交完整 YAML 内容以原子方式覆盖配置文件。请求体必须通过后端校验，写入失败会自动回滚到旧配置。

更新成功后，后端会立即重新加载配置，现有 watcher 和运行时状态会同步刷新。建议在 CI/CD 中通过自定义脚本调用这些接口并记录审计日志。

### 6. 管理后台 UI

除了API接口，piapi还内置了一个基于Next.js的Web管理界面，提供可视化的配置管理能力。

**启用Admin UI：**

管理界面默认关闭，需要设置 `PIAPI_ADMIN_TOKEN` 环境变量来启用：

```bash
PIAPI_ADMIN_TOKEN='your-secret-token' ./piapi --config config.yaml --listen :9200
```

启用后，访问 `http://localhost:9200/piadmin` 即可进入管理界面。

**功能特性：**

* **Providers管理**：查看和编辑上游服务提供商配置，包括API密钥和服务端点
* **Services管理**：配置服务类型、认证方式和路由规则
* **Users管理**：管理用户API密钥与服务映射关系
* **实时配置更新**：所有修改即时生效，无需重启服务

**安全建议：**

* 使用强随机密钥作为Admin Token（推荐：`openssl rand -base64 32`）
* 在生产环境中建议通过VPN或IP白名单限制Admin界面访问
* 定期审计配置变更日志
* 配置文件(config.yaml)包含敏感信息，请确保文件权限为600

**Docker部署示例：**

```bash
# 生成管理令牌并写入.env文件
echo "PIAPI_ADMIN_TOKEN=$(openssl rand -base64 32)" > .env

# 方式1：使用Docker Compose（推荐）
docker compose build
docker compose up -d

# 方式2：使用Makefile构建镜像
make docker-build

# 方式3：直接运行镜像
docker run -d \
  -p 9200:9200 \
  -v "$(pwd)/config.yaml:/app/config.yaml:ro" \
  -e PIAPI_ADMIN_TOKEN="$(cat .env | grep PIAPI_ADMIN_TOKEN | cut -d= -f2)" \
  piapi-gateway:latest

# 访问管理界面: http://localhost:9200/piadmin
```

**开发与构建：**

```bash
# 安装前端依赖
make admin-install

# 构建前端和后端
make build

# 仅构建后端（跳过前端构建）
make build-skip-admin

# 清理前端构建产物
make admin-clean
```

### 7. 故障排除

#### Admin UI 无法访问 (404)

**症状**: 访问 `/piadmin` 返回 404 Not Found

**解决方案**:
```bash
# 1. 检查环境变量是否设置
docker compose logs piapi | grep "admin UI"
# 应该看到: "admin UI enabled at /piadmin"

# 2. 如果没有启用，设置 PIAPI_ADMIN_TOKEN
echo "PIAPI_ADMIN_TOKEN=$(openssl rand -base64 32)" > .env
docker compose restart piapi

# 3. 确认使用正确的路径
# 正确: http://your-host:9200/piadmin/
# 错误: http://your-host:9200/admin/
```

#### 配置更新失败 (Permission Denied)

**症状**: 通过管理界面更新配置时出现 "permission denied" 错误

**原因**: Docker 容器以非 root 用户（UID 65532）运行，但配置文件属于 root

**解决方案**:
```bash
# 方案 1: 修改文件所有者（推荐）
sudo chown 65532:65532 config.yaml
chmod 600 config.yaml

# 方案 2: 允许所有用户读写（简单但不够安全）
chmod 666 config.yaml

# 重启容器应用更改
docker compose restart piapi
```

#### 复制功能不工作

**症状**: 点击"复制用户配置"按钮时报错

**原因**: 在 HTTP 环境下，浏览器的 Clipboard API 不可用

**解决方案**:
- 确保使用最新版本（已包含 HTTP 环境的降级方案）
- 或使用 HTTPS 访问
- 或使用 localhost 访问

#### 静态资源 404 (JS/CSS 文件)

**症状**: 页面加载不完整，浏览器控制台显示 JS/CSS 404 错误

**解决方案**:
```bash
# 1. 确保使用最新版本
git pull
docker compose build --no-cache

# 2. 清除浏览器缓存
# Chrome: Ctrl+Shift+Delete
# Firefox: Ctrl+Shift+Delete

# 3. 验证构建包含前端资源
docker compose exec piapi ls -la /app/
# 应该看到 piapi 可执行文件
```

#### API 请求失败 (404)

**症状**: 登录后看到 API 请求失败

**解决方案**:
```bash
# 1. 检查请求的 URL 路径
# 浏览器开发者工具 -> Network
# 应该是: /piadmin/api/config
# 不应该是: /api/config 或 /admin/api/config

# 2. 确保使用最新版本
git pull
docker compose build

# 3. 验证 token 正确
echo $PIAPI_ADMIN_TOKEN
# 或
cat .env | grep PIAPI_ADMIN_TOKEN
```

#### 使用远程镜像时缺少最新修复

**症状**: 使用 `ghcr.io/prehisle/piapi:main` 时遇到已知问题

**解决方案**:
```bash
# 切换到本地构建以获得最新修复
cd /path/to/piapi

# 修改 docker-compose.yml
# 将 image: ghcr.io/prehisle/piapi:main
# 改为 build: .

# 或使用 sed 命令
sed -i 's/image: ghcr.io\/prehisle\/piapi:main/build: ./g' docker-compose.yml
sed -i '/pull_policy: always/d' docker-compose.yml

# 构建并启动
docker compose build
docker compose up -d
```

## 构建与测试

### 运行测试

```bash
# 运行所有测试
make test

# 查看测试覆盖率
go test -cover ./...
```

**测试覆盖率**：
- internal/adminapi: 72.7%
- internal/config: 70.5%
- internal/server: 72.8%
- internal/logging: 100%
- internal/metrics: 100%
- **整体覆盖率**: ~77%

### 构建二进制

```bash
# 完整构建（包含前端）
make build

# 快速构建（跳过前端）
make build-skip-admin

# 仅构建前端
make admin-build
```

### 构建容器镜像

```bash
# 本地构建
make docker-build

# 或直接使用 Docker
docker build -t piapi-gateway:latest .
```

**Docker镜像大小**: 36MB (使用 distroless 基础镜像)

### 多平台发行包

```bash
# 构建管理后台并生成多平台压缩包
make release
```

命令会在 `dist/releases/` 下为 linux/amd64、linux/arm64、darwin/amd64、darwin/arm64 与 windows/amd64 输出对应的压缩包，内部包含已嵌入前端资源的 `piapi` 可执行文件与 `config.yaml.example`、`README.md`。将压缩包下载到目标环境解压后，即可直接运行：

```bash
# 进入解压后的目录
./piapi --config config.yaml --listen :9200
```

Windows 平台可执行文件带 `.exe` 后缀，可通过 PowerShell 运行：

```powershell
./piapi.exe --config config.yaml --listen :9200
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
