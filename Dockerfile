# syntax=docker/dockerfile:1

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /workspace/web/admin

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy frontend package files
COPY web/admin/package.json web/admin/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy frontend source and build
COPY web/admin/ ./
RUN pnpm build

# Stage 2: Build Go binary
FROM golang:1.23 AS builder
WORKDIR /workspace

# Copy Go module files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Copy frontend build output
COPY --from=frontend-builder /workspace/web/admin/out /workspace/internal/adminui/dist

# Build Go binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /piapi ./cmd/piapi

# Stage 3: Runtime
FROM gcr.io/distroless/base-debian12:nonroot
WORKDIR /app
COPY --from=builder /piapi /app/piapi
USER nonroot
EXPOSE 9200
ENTRYPOINT ["/app/piapi"]
CMD ["--config", "/app/config.yaml", "--listen", ":9200"]
