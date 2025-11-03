package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"piapi/internal/adminapi"
	"piapi/internal/adminui"
	"piapi/internal/config"
	"piapi/internal/logging"
	"piapi/internal/metrics"
	"piapi/internal/server"
)

func main() {
	configPath := flag.String("config", "config.yaml", "path to config.yaml")
	listenAddr := flag.String("listen", ":9200", "HTTP listen address")
	flag.Parse()

	baseLogger, err := logging.NewLogger()
	if err != nil {
		log.Fatalf("failed to create logger: %v", err)
	}
	defer func() {
		_ = baseLogger.Sync()
	}()
	sugar := baseLogger.Sugar()

	manager := config.NewManager()
	if err := ensureDevConfig(*configPath); err != nil {
		sugar.Fatalw("failed to ensure dev config", "path", *configPath, "error", err)
	}
	if err := manager.LoadFromFile(*configPath); err != nil {
		sugar.Fatalw("failed to load config", "path", *configPath, "error", err)
	}
	sugar.Infow("configuration loaded", "path", *configPath)

	rootCtx, rootCancel := context.WithCancel(context.Background())
	defer rootCancel()

	configLogger := baseLogger.Named("config").Sugar()
	if err := config.WatchFile(rootCtx, manager, *configPath, configLogger.Infof); err != nil {
		configLogger.Fatalw("failed to start config watcher", "error", err)
	}

	gateway := &server.Gateway{
		Config: manager,
		Logger: baseLogger.Named("gateway"),
	}

	adminToken := os.Getenv("PIAPI_ADMIN_TOKEN")
	if adminToken == "" {
		sugar.Infow("admin api disabled (PIAPI_ADMIN_TOKEN not set)")
	}

	mux := http.NewServeMux()
	mux.Handle("/piapi/", server.RequestIDMiddleware(gateway))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("/metrics", metrics.Handler())

	if adminToken != "" {
		adminLogger := baseLogger.Named("admin")
		adminHandler := adminapi.NewHandler(manager, *configPath, adminToken, adminLogger)
		mux.Handle("/piadmin/api/", server.RequestIDMiddleware(http.StripPrefix("/piadmin/api", adminHandler)))

		// Serve admin UI
		uiHandler, err := adminui.NewHandler()
		if err != nil {
			sugar.Warnw("failed to initialize admin UI", "error", err)
		} else {
			mux.Handle("/piadmin/", uiHandler)
			sugar.Infow("admin UI enabled at /piadmin")
		}
	}

	srv := &http.Server{
		Addr:         *listenAddr,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 300 * time.Second, // 5 minutes for streaming responses
		IdleTimeout:  2 * time.Minute,
	}

	errCh := make(chan error, 1)
	go func() {
		sugar.Infow("piapi listening", "addr", *listenAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		sugar.Infow("received shutdown signal", "signal", sig.String())
	case err := <-errCh:
		sugar.Fatalw("server error", "error", err)
	}

	rootCancel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		sugar.Fatalw("graceful shutdown failed", "error", err)
	}
	sugar.Infow("shutdown complete")
}

func ensureDevConfig(path string) error {
	_, err := os.Stat(path)
	if err == nil || !errors.Is(err, os.ErrNotExist) {
		return err
	}

	if filepath.Base(path) != "config.dev.yaml" {
		return nil
	}

	dir := filepath.Dir(path)
	if dir != "." && dir != "" {
		if mkErr := os.MkdirAll(dir, 0o755); mkErr != nil {
			return mkErr
		}
	}

	defaultConfig := []byte("providers: []\nusers: []\n")
	if writeErr := os.WriteFile(path, defaultConfig, 0o600); writeErr != nil {
		return writeErr
	}

	return nil
}
