# syntax=docker/dockerfile:1

FROM golang:1.23 AS builder
WORKDIR /workspace
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /piapi ./cmd/piapi

FROM gcr.io/distroless/base-debian12:nonroot
WORKDIR /app
COPY --from=builder /piapi /app/piapi
USER nonroot
EXPOSE 9200
ENTRYPOINT ["/app/piapi"]
CMD ["--config", "/app/config.yaml", "--listen", ":9200"]
