package logging

import "go.uber.org/zap"

// NewLogger creates a structured logger configured for production-style JSON output.
func NewLogger() (*zap.Logger, error) {
	cfg := zap.NewProductionConfig()
	cfg.EncoderConfig.TimeKey = "timestamp"
	cfg.EncoderConfig.MessageKey = "message"
	cfg.EncoderConfig.CallerKey = "caller"
	return cfg.Build()
}
