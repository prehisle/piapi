APP_NAME := piapi
BINARY := ./bin/$(APP_NAME)
IMAGE := piapi-gateway:latest
CONFIG ?= config.yaml
LISTEN_ADDR ?= :9200
ADMIN_UI_DIR := web/admin
ADMIN_UI_DIST := internal/adminui/dist
RELEASE_DIR := dist/releases
RELEASE_PLATFORMS := linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64

.PHONY: all build build-skip-admin test run docker-build clean admin-install admin-build admin-clean dev-backend dev-frontend release

all: build

# Build Go binary (requires frontend to be built first)
build: admin-build
	mkdir -p ./bin
	GOOS=$(shell go env GOOS) GOARCH=$(shell go env GOARCH) go build -o $(BINARY) ./cmd/piapi

# Build without admin UI (for quick iteration)
build-skip-admin:
	mkdir -p ./bin
	GOOS=$(shell go env GOOS) GOARCH=$(shell go env GOARCH) go build -o $(BINARY) ./cmd/piapi

clean:
	rm -rf ./bin

admin-install:
	cd $(ADMIN_UI_DIR) && CI=1 pnpm install --frozen-lockfile --prefer-offline --reporter=silent

admin-build: admin-install
	cd $(ADMIN_UI_DIR) && NEXT_DISABLE_TURBOPACK=1 pnpm build
	rm -rf $(ADMIN_UI_DIST)
	cp -r $(ADMIN_UI_DIR)/out $(ADMIN_UI_DIST)

admin-clean:
	rm -rf $(ADMIN_UI_DIR)/.next
	rm -rf $(ADMIN_UI_DIR)/out
	rm -rf $(ADMIN_UI_DIR)/node_modules
	rm -rf $(ADMIN_UI_DIST)

run: build
	$(BINARY) --config $(CONFIG) --listen $(LISTEN_ADDR)

test:
	go test ./...

docker-build:
	docker build -t $(IMAGE) .

dev-backend:
	GOFLAGS=-mod=mod go run github.com/air-verse/air@latest -c ./.air.toml

dev-frontend:
	cd $(ADMIN_UI_DIR) && pnpm dev

release: admin-build
	rm -rf $(RELEASE_DIR)
	mkdir -p $(RELEASE_DIR)
	@set -e; \
	for platform in $(RELEASE_PLATFORMS); do \
		IFS=/ read -r os arch <<< "$$platform"; \
		output="$(APP_NAME)-$$os-$$arch"; \
		bin_name="$(APP_NAME)"; \
		if [ "$$os" = "windows" ]; then \
			bin_name="$(APP_NAME).exe"; \
		fi; \
		build_dir="$(RELEASE_DIR)/$$output"; \
		mkdir -p "$$build_dir"; \
		GOOS=$$os GOARCH=$$arch CGO_ENABLED=0 go build -o "$$build_dir/$$bin_name" ./cmd/piapi; \
		cp config.yaml.example "$$build_dir/"; \
		cp README.md "$$build_dir/README.md"; \
		( cd "$(RELEASE_DIR)" && { \
			if [ "$$os" = "windows" ]; then \
				zip -qr "$$output.zip" "$$output"; \
			else \
				tar -czf "$$output.tar.gz" "$$output"; \
			fi; \
		}); \
		rm -rf "$$build_dir"; \
	done
