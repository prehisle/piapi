APP_NAME := piapi
BINARY := ./bin/$(APP_NAME)
IMAGE := piapi-gateway:latest
CONFIG ?= config.yaml
LISTEN_ADDR ?= :9200

.PHONY: all build test run docker-build clean

all: build

build:
	mkdir -p ./bin
	GOOS=$(shell go env GOOS) GOARCH=$(shell go env GOARCH) go build -o $(BINARY) ./cmd/piapi

clean:
	rm -rf ./bin

run: build
	$(BINARY) --config $(CONFIG) --listen $(LISTEN_ADDR)

test:
	go test ./...

docker-build:
	docker build -t $(IMAGE) .
