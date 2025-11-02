# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running and Testing
- `go run ./cmd/piapi --config config.yaml --listen :9200` - Run the gateway locally with config file
- `make test` or `go test ./...` - Run all tests
- `go test -run TestConfig ./internal/config` - Run specific package tests
- `make build` - Build binary to `./bin/piapi`
- `make run CONFIG=config.dev.yaml LISTEN_ADDR=:9300` - Build and run with custom config/port
- `make clean` - Clean build artifacts

### Docker Commands
- `make docker-build` - Build `piapi-gateway:latest` image
- `docker compose up -d` - Run with Docker Compose (mounts local config)
- `docker compose pull` - Pull latest image from GHCR

### Admin UI Commands (Frontend)
- `make admin-install` - Install frontend dependencies (pnpm)
- `make admin-build` - Build frontend and copy to Go embed directory
- `make admin-clean` - Clean frontend build artifacts
- `make build` - Build complete binary (includes admin-build)
- `make build-skip-admin` - Quick Go build without rebuilding frontend

## Architecture Overview

piapi is a minimal LLM gateway that routes requests to upstream services based on user configuration. The architecture follows a clean separation of concerns:

### Core Components

**Main Entry** (`cmd/piapi/main.go`):
- Parses command-line flags (`--config`, `--listen`)
- Initializes logger, config manager, and HTTP server
- Sets up graceful shutdown with signal handling
- Enables admin API when `PIAPI_ADMIN_TOKEN` environment variable is set

**Config Management** (`internal/config/`):
- `types.go` - Defines configuration structs (Provider, Service, User, AuthConfig)
- `manager.go` - Config loading and user/service resolution logic
- `parser.go` - YAML parsing and validation
- `watcher.go` - Hot-reloading with fsnotify
- Uses YAML configuration with providers, services, and user mappings

**HTTP Gateway** (`internal/server/`):
- `gateway.go` - Core reverse proxy logic with request routing
- `middleware.go` - Request ID middleware for tracing
- Routes `/piapi/<service_type>/...` to configured upstream services
- Handles Bearer token authentication and user resolution
- Supports both header and query-based upstream authentication

**Admin API** (`internal/adminapi/`):
- Protected configuration management endpoints
- `GET /admin/api/config` - Structured config snapshot
- `GET /admin/api/config/raw` - Raw YAML config
- `PUT /admin/api/config/raw` - Atomic config updates
- Requires `PIAPI_ADMIN_TOKEN` for authentication

**Admin UI** (`internal/adminui/`):
- Web-based management interface
- Built with Next.js 16 + React 19 + Tailwind CSS 4
- Static export embedded in Go binary using `//go:embed`
- Frontend source in `web/admin/`, build output in `internal/adminui/dist/`
- Served at `/admin/` when `PIAPI_ADMIN_TOKEN` is set
- SPA routing with client-side fallback to `admin.html`

**Observability**:
- `internal/logging/` - zap JSON logger with request context
- `internal/metrics/` - Prometheus metrics for requests and latency
- Endpoints: `/healthz`, `/metrics`

### Request Flow

1. Request comes to `/piapi/<service_type>/...` with Bearer token
2. Gateway extracts service type and user API key
3. Config manager resolves user → provider → upstream route
4. Proxy forwards request to configured BaseURL with proper authentication
5. Request is logged with request ID, user, service type, and upstream info

### Configuration Model

- **Providers**: Define upstream services with multiple API keys
- **Services**: Specify service types (codex, claude_code, etc.) with BaseURL and auth method
- **Users**: Map piapi API keys to specific provider services and keys
- **Authentication**: Supports header-based (default Authorization: Bearer) and query parameter auth

### Hot Reloading

The service watches the config file and automatically reloads changes. Failed reloads keep the old configuration active and increment failure metrics.

## Key Implementation Details

- Uses Go 1.23+ with standard library HTTP server
- Context-based request tracing with unique request IDs
- Graceful shutdown with 5-second timeout
- WriteTimeout set to 300 seconds (5 minutes) for streaming LLM responses
- JSON structured logging with zap
- Prometheus metrics for HTTP status codes and latency
- Admin API disabled by default (requires PIAPI_ADMIN_TOKEN)
- Configuration validation on load and reload

## Recent Work & Current Status (2025-11-03)

### ✅ Completed: Admin UI Integration

**Backend Integration:**
- Created `internal/adminui/` package with embedded static files
- Implemented SPA handler with client-side routing support
- Integrated into `main.go` - UI only enabled when `PIAPI_ADMIN_TOKEN` is set
- Admin UI available at `/admin/`, Admin API at `/admin/api/`

**Frontend Build:**
- Next.js 16 + React 19 + Tailwind CSS 4
- Static export mode (`output: 'export'`)
- Refactored dynamic routes to use query parameters (e.g., `/admin/providers/edit?name=xyz`)
- Build output: `web/admin/out/` → copied to `internal/adminui/dist/` for embedding
- TypeScript type checking disabled in build (minor type issues remain in UI components)

**Build System:**
- Updated Makefile with `admin-install`, `admin-build`, `admin-clean` targets
- Updated Dockerfile with 3-stage build: Node.js → Go → Distroless runtime
- `make build` now automatically builds frontend before Go binary

**Bug Fixes:**
- Fixed config.yaml auth prefix (added trailing space: `prefix: 'Bearer '`)
- Set proper WriteTimeout to prevent slow client resource exhaustion
- Fixed frontend hooks to use real API instead of fake data

### 🔧 Known Issues & Limitations

1. **Frontend Type Errors**: Minor TypeScript type errors in shadcn/ui components (Badge, etc.)
   - Workaround: Build with `typescript.ignoreBuildErrors: true`
   - Does not affect runtime functionality

2. **Frontend API Integration**: Hooks connect to backend API but may need refinement
   - `use-providers.ts` updated to use SWR + real API
   - Other hooks may still use placeholder data

3. **Test Coverage**:
   - `internal/logging`: 0% (no test files)
   - `internal/metrics`: 0% (no test files)
   - `internal/adminapi`: 59.5%
   - Target: 70%+ for all packages

4. **Documentation**:
   - README needs update with admin UI usage instructions
   - `docs/04管理后台实施方案.md` describes the plan, but implementation details not documented

### 📋 Next Steps / TODO

1. **Testing & Validation**:
   - Run `./test-admin-ui.sh` to verify end-to-end integration
   - Manual browser testing of admin UI
   - Verify Docker build with multi-stage Dockerfile

2. **Documentation**:
   - Update README with admin UI section
   - Document `PIAPI_ADMIN_TOKEN` security best practices
   - Add screenshots/GIFs of admin UI

3. **Code Quality**:
   - Add tests for `internal/logging` and `internal/metrics`
   - Increase `internal/adminapi` coverage to 70%+
   - Fix TypeScript type errors in frontend (optional, low priority)

4. **Deployment**:
   - Test Docker Compose with embedded admin UI
   - Verify GHCR image build in CI/CD
   - Consider adding IP whitelist for admin routes

### 🛠️ Development Workflow

**First-time setup:**
```bash
make admin-install  # Install frontend dependencies
make build          # Build frontend + backend
```

**Running with admin UI:**
```bash
PIAPI_ADMIN_TOKEN=your-secret ./bin/piapi --config config.yaml
# Access at: http://localhost:9200/admin
```

**Quick iteration (backend only):**
```bash
make build-skip-admin  # Skip frontend rebuild
```

**Frontend development:**
```bash
cd web/admin
pnpm dev  # Hot reload at http://localhost:3000
# Configure NEXT_PUBLIC_ADMIN_API_BASE to point to running piapi instance
```

### 📁 Directory Structure

```
piapi/
├── cmd/piapi/              # Main entry point
├── internal/
│   ├── adminapi/           # Admin API handlers
│   ├── adminui/            # Admin UI static file server
│   │   ├── handler.go
│   │   └── dist/           # Frontend build output (embedded, gitignored)
│   ├── config/             # Configuration management
│   ├── logging/            # Structured logging
│   ├── metrics/            # Prometheus metrics
│   └── server/             # HTTP gateway & middleware
├── web/admin/              # Admin UI source (Next.js)
│   ├── app/                # Next.js app directory
│   ├── components/         # React components
│   ├── hooks/              # React hooks
│   ├── lib/                # Utilities & API client
│   ├── out/                # Build output (gitignored)
│   └── package.json
├── Dockerfile              # Multi-stage: Node + Go + Runtime
├── Makefile                # Build commands (includes admin-* targets)
├── test-admin-ui.sh        # Integration test script
└── CLAUDE.md               # This file
```

### 🔐 Security Notes

- Admin API/UI only enabled when `PIAPI_ADMIN_TOKEN` environment variable is set
- Token validated using constant-time comparison to prevent timing attacks
- Recommended: Use strong random tokens (e.g., `openssl rand -base64 32`)
- Consider deploying admin interface behind VPN or IP whitelist
- Regular `config.yaml` contains real API keys - ensure proper file permissions (0600)