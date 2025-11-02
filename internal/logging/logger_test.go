package logging

import (
	"testing"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func TestNewLogger(t *testing.T) {
	logger, err := NewLogger()
	if err != nil {
		t.Fatalf("NewLogger() failed: %v", err)
	}
	if logger == nil {
		t.Fatal("NewLogger() returned nil logger")
	}
	defer logger.Sync()

	// Verify logger is functional
	logger.Info("test message", zap.String("key", "value"))
}

func TestNewLoggerConfiguration(t *testing.T) {
	logger, err := NewLogger()
	if err != nil {
		t.Fatalf("NewLogger() failed: %v", err)
	}
	if logger == nil {
		t.Fatal("NewLogger() returned nil logger")
	}
	defer logger.Sync()

	// Verify the logger has the expected configuration
	// Since we can't directly inspect the config, we test that it logs properly
	core := logger.Core()
	if !core.Enabled(zapcore.InfoLevel) {
		t.Error("Logger should be enabled at Info level")
	}
	if !core.Enabled(zapcore.ErrorLevel) {
		t.Error("Logger should be enabled at Error level")
	}
	if !core.Enabled(zapcore.WarnLevel) {
		t.Error("Logger should be enabled at Warn level")
	}
}

func TestNewLoggerMultipleCalls(t *testing.T) {
	// Verify we can create multiple loggers
	logger1, err := NewLogger()
	if err != nil {
		t.Fatalf("First NewLogger() call failed: %v", err)
	}
	defer logger1.Sync()

	logger2, err := NewLogger()
	if err != nil {
		t.Fatalf("Second NewLogger() call failed: %v", err)
	}
	defer logger2.Sync()

	// Both loggers should be independent
	logger1.Info("logger1")
	logger2.Info("logger2")
}
