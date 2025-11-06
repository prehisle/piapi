package logging

import (
	"os"
	"strconv"

	"go.uber.org/zap"
)

var (
	// GlobalRequestLogStore is the global request log store instance
	GlobalRequestLogStore *RequestLogStore
)

func init() {
	// Initialize global request log store with capacity from env or default 1000
	capacity := 1000
	if envCap := os.Getenv("PIAPI_LOG_CAPACITY"); envCap != "" {
		if c, err := strconv.Atoi(envCap); err == nil && c > 0 {
			capacity = c
		}
	}
	GlobalRequestLogStore = NewRequestLogStore(capacity)
}

// NewLogger creates a structured logger configured for production-style JSON output.
func NewLogger() (*zap.Logger, error) {
	cfg := zap.NewProductionConfig()
	cfg.EncoderConfig.TimeKey = "timestamp"
	cfg.EncoderConfig.MessageKey = "message"
	cfg.EncoderConfig.CallerKey = "caller"
	return cfg.Build()
}
