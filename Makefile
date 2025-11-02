APP_NAME := piapi
BINARY := ./bin/$(APP_NAME)
IMAGE := piapi-gateway:latest
CONFIG ?= config.yaml
LISTEN_ADDR ?= :9200
ADMIN_UI_DIR := web/admin
ADMIN_UI_DIST := internal/adminui/dist

.PHONY: all build test run docker-build clean admin-install admin-build admin-clean

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
	cd $(ADMIN_UI_DIR) && pnpm install

admin-build: admin-install
	cd $(ADMIN_UI_DIR) && pnpm build
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
