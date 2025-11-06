package adminapi

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"go.uber.org/zap"

	"piapi/internal/config"
	"piapi/internal/logging"
)

const (
	maxConfigPayloadSize = 1 << 20 // 1 MiB should be ample for config.yaml
	yamlContentType      = "application/x-yaml"
	jsonContentType      = "application/json"
)

// Handler exposes administrative operations for managing the gateway configuration.
type Handler struct {
	manager    *config.Manager
	configPath string
	token      string
	logger     *zap.Logger

	mu sync.Mutex
}

// NewHandler constructs a new admin handler. token must be non-empty.
func NewHandler(manager *config.Manager, configPath, token string, logger *zap.Logger) *Handler {
	return &Handler{
		manager:    manager,
		configPath: configPath,
		token:      token,
		logger:     logger,
	}
}

// ServeHTTP dispatches admin API requests. It expects to be mounted under /admin/api/.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.token == "" {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	}

	if !h.authorize(r) {
		w.Header().Set("WWW-Authenticate", "Bearer realm=\"piapi-admin\"")
		http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/")
	switch {
	case matchPath(path, "config/raw") && r.Method == http.MethodGet:
		h.handleGetConfigRaw(w, r)
	case matchPath(path, "config/raw") && r.Method == http.MethodPut:
		h.handlePutConfigRaw(w, r)
	case matchPath(path, "config") && r.Method == http.MethodGet:
		h.handleGetConfigStructured(w, r)
	case matchPath(path, "stats/routes") && r.Method == http.MethodGet:
		h.handleGetRouteStats(w, r)
	case matchPath(path, "dashboard/logs") && r.Method == http.MethodGet:
		h.handleGetDashboardLogs(w, r)
	case matchPath(path, "dashboard/stats") && r.Method == http.MethodGet:
		h.handleGetDashboardStats(w, r)
	default:
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
	}
}

func (h *Handler) authorize(r *http.Request) bool {
	if h.token == "" {
		return false
	}
	authz := r.Header.Get("Authorization")
	if authz == "" {
		return false
	}
	if len(authz) < 7 || !strings.EqualFold(authz[:7], "Bearer ") {
		return false
	}
	token := strings.TrimSpace(authz[7:])
	if token == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(h.token)) == 1
}

func (h *Handler) handleGetConfigRaw(w http.ResponseWriter, _ *http.Request) {
	data, err := os.ReadFile(h.configPath)
	if err != nil {
		h.internalError(w, fmt.Errorf("read config: %w", err))
		return
	}
	w.Header().Set("Content-Type", yamlContentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (h *Handler) handleGetConfigStructured(w http.ResponseWriter, _ *http.Request) {
	cfg := h.manager.Current()
	if cfg == nil {
		h.internalError(w, errors.New("configuration not loaded"))
		return
	}
	payload, err := json.Marshal(cfg)
	if err != nil {
		h.internalError(w, fmt.Errorf("marshal config: %w", err))
		return
	}
	w.Header().Set("Content-Type", jsonContentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

func (h *Handler) handleGetRouteStats(w http.ResponseWriter, r *http.Request) {
	if h.manager == nil {
		h.internalError(w, errors.New("configuration not loaded"))
		return
	}

	apiKey := strings.TrimSpace(r.URL.Query().Get("apiKey"))
	service := strings.TrimSpace(r.URL.Query().Get("service"))

	stats, err := h.manager.RuntimeStatus(apiKey, service)
	if err != nil {
		switch {
		case errors.Is(err, config.ErrAPIKeyRequired), errors.Is(err, config.ErrServiceTypeRequired):
			h.badRequest(w, err)
		case errors.Is(err, config.ErrUserNotFound), errors.Is(err, config.ErrServiceNotFound):
			writeError(w, http.StatusNotFound, err)
		case errors.Is(err, config.ErrConfigNotLoaded):
			writeError(w, http.StatusServiceUnavailable, err)
		default:
			h.internalError(w, err)
		}
		return
	}

	payload, err := json.Marshal(stats)
	if err != nil {
		h.internalError(w, fmt.Errorf("marshal stats: %w", err))
		return
	}

	w.Header().Set("Content-Type", jsonContentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

func (h *Handler) handlePutConfigRaw(w http.ResponseWriter, r *http.Request) {
	bodyReader := http.MaxBytesReader(w, r.Body, maxConfigPayloadSize)
	defer bodyReader.Close()

	payload, err := io.ReadAll(bodyReader)
	if err != nil {
		h.badRequest(w, fmt.Errorf("read body: %w", err))
		return
	}

	payload = bytes.TrimSpace(payload)
	if len(payload) == 0 {
		h.badRequest(w, errors.New("config payload is empty"))
		return
	}

	if _, err := config.ParseYAML(payload); err != nil {
		h.badRequest(w, fmt.Errorf("invalid config: %w", err))
		return
	}

	if err := h.writeConfig(payload); err != nil {
		h.internalError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) writeConfig(payload []byte) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Read original config for backup
	original, err := os.ReadFile(h.configPath)
	if err != nil {
		return fmt.Errorf("read existing config: %w", err)
	}

	// Create backup file in same directory
	dir := filepath.Dir(h.configPath)
	backupFile, err := os.CreateTemp(dir, "config-backup-*.yaml")
	if err != nil {
		return fmt.Errorf("create backup file: %w", err)
	}
	backupName := backupFile.Name()
	defer func() {
		_ = backupFile.Close()
		_ = os.Remove(backupName)
	}()

	if _, err := backupFile.Write(original); err != nil {
		return fmt.Errorf("write backup: %w", err)
	}
	if err := backupFile.Sync(); err != nil {
		return fmt.Errorf("sync backup: %w", err)
	}
	if err := backupFile.Close(); err != nil {
		return fmt.Errorf("close backup: %w", err)
	}

	// Write new config directly to the target file
	// This works with Docker bind mounts, unlike os.Rename()
	if err := os.WriteFile(h.configPath, payload, 0600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}

	// Validate by reloading config
	if err := h.manager.LoadFromFile(h.configPath); err != nil {
		// Restore from backup on failure
		if restoreErr := os.WriteFile(h.configPath, original, 0600); restoreErr != nil {
			h.logger.Error("failed to restore config after load failure", zap.Error(restoreErr))
		} else {
			_ = h.manager.LoadFromFile(h.configPath) // Try to reload backup
		}
		return fmt.Errorf("reload config: %w", err)
	}

	h.logger.Info("config updated via admin API")
	return nil
}

func (h *Handler) restore(original []byte) error {
	// Write directly to config file (works with Docker bind mounts)
	if err := os.WriteFile(h.configPath, original, 0600); err != nil {
		return fmt.Errorf("restore config file: %w", err)
	}

	return h.manager.LoadFromFile(h.configPath)
}

func (h *Handler) badRequest(w http.ResponseWriter, err error) {
	h.logger.Warn("admin api bad request", zap.Error(err))
	writeError(w, http.StatusBadRequest, err)
}

func (h *Handler) internalError(w http.ResponseWriter, err error) {
	h.logger.Error("admin api internal error", zap.Error(err))
	writeError(w, http.StatusInternalServerError, err)
}

func (h *Handler) handleGetDashboardLogs(w http.ResponseWriter, r *http.Request) {
	if logging.GlobalRequestLogStore == nil {
		h.internalError(w, errors.New("request log store not initialized"))
		return
	}

	query := r.URL.Query()
	provider := strings.TrimSpace(query.Get("provider"))
	user := strings.TrimSpace(query.Get("user"))
	serviceType := strings.TrimSpace(query.Get("service"))
	limitStr := strings.TrimSpace(query.Get("limit"))

	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	opts := logging.QueryOptions{
		Provider:    provider,
		User:        user,
		ServiceType: serviceType,
		Limit:       limit,
	}

	logs := logging.GlobalRequestLogStore.Query(opts)

	payload, err := json.Marshal(map[string]interface{}{
		"logs":  logs,
		"count": len(logs),
	})
	if err != nil {
		h.internalError(w, fmt.Errorf("marshal logs: %w", err))
		return
	}

	w.Header().Set("Content-Type", jsonContentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

func (h *Handler) handleGetDashboardStats(w http.ResponseWriter, r *http.Request) {
	cfg := h.manager.Current()
	if cfg == nil {
		h.internalError(w, errors.New("configuration not loaded"))
		return
	}

	// Calculate stats from request log store
	requestStats := calculateRequestStats()

	// Combine stats
	stats := map[string]interface{}{
		"request_stats": requestStats,
		"providers":     extractProviderNames(cfg),
		"users":         extractUserNames(cfg),
		"service_types": extractServiceTypes(cfg),
	}

	payload, err := json.Marshal(stats)
	if err != nil {
		h.internalError(w, fmt.Errorf("marshal stats: %w", err))
		return
	}

	w.Header().Set("Content-Type", jsonContentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

func calculateRequestStats() map[string]interface{} {
	if logging.GlobalRequestLogStore == nil {
		return map[string]interface{}{
			"total_requests": 0,
			"success_rate":   0.0,
			"avg_latency_ms": 0.0,
			"error_count":    0,
			"by_service":     map[string]interface{}{},
			"by_provider":    map[string]interface{}{},
			"by_user":        map[string]interface{}{},
		}
	}

	// Get all logs
	allLogs := logging.GlobalRequestLogStore.Query(logging.QueryOptions{Limit: 10000})

	totalRequests := len(allLogs)
	if totalRequests == 0 {
		return map[string]interface{}{
			"total_requests": 0,
			"success_rate":   0.0,
			"avg_latency_ms": 0.0,
			"error_count":    0,
			"by_service":     map[string]interface{}{},
			"by_provider":    map[string]interface{}{},
			"by_user":        map[string]interface{}{},
		}
	}

	successCount := 0
	errorCount := 0
	totalLatency := int64(0)
	byService := make(map[string]map[string]int)
	byProvider := make(map[string]map[string]int)
	byUser := make(map[string]map[string]int)

	for _, log := range allLogs {
		// Count successes (2xx and 3xx)
		if log.StatusCode >= 200 && log.StatusCode < 400 {
			successCount++
		}
		if log.Error != "" || log.StatusCode >= 400 {
			errorCount++
		}

		totalLatency += log.LatencyMs

		// By service
		if _, ok := byService[log.ServiceType]; !ok {
			byService[log.ServiceType] = map[string]int{"total": 0, "success": 0, "error": 0}
		}
		byService[log.ServiceType]["total"]++
		if log.StatusCode >= 200 && log.StatusCode < 400 {
			byService[log.ServiceType]["success"]++
		} else {
			byService[log.ServiceType]["error"]++
		}

		// By provider
		if _, ok := byProvider[log.Provider]; !ok {
			byProvider[log.Provider] = map[string]int{"total": 0, "success": 0, "error": 0}
		}
		byProvider[log.Provider]["total"]++
		if log.StatusCode >= 200 && log.StatusCode < 400 {
			byProvider[log.Provider]["success"]++
		} else {
			byProvider[log.Provider]["error"]++
		}

		// By user
		if _, ok := byUser[log.User]; !ok {
			byUser[log.User] = map[string]int{"total": 0, "success": 0, "error": 0}
		}
		byUser[log.User]["total"]++
		if log.StatusCode >= 200 && log.StatusCode < 400 {
			byUser[log.User]["success"]++
		} else {
			byUser[log.User]["error"]++
		}
	}

	successRate := 0.0
	if totalRequests > 0 {
		successRate = float64(successCount) / float64(totalRequests) * 100
	}

	avgLatency := 0.0
	if totalRequests > 0 {
		avgLatency = float64(totalLatency) / float64(totalRequests)
	}

	return map[string]interface{}{
		"total_requests": totalRequests,
		"success_count":  successCount,
		"error_count":    errorCount,
		"success_rate":   successRate,
		"avg_latency_ms": avgLatency,
		"by_service":     byService,
		"by_provider":    byProvider,
		"by_user":        byUser,
	}
}

func extractProviderNames(cfg *config.Config) []string {
	names := make([]string, 0, len(cfg.Providers))
	for _, p := range cfg.Providers {
		names = append(names, p.Name)
	}
	return names
}

func extractUserNames(cfg *config.Config) []string {
	names := make([]string, 0, len(cfg.Users))
	for _, u := range cfg.Users {
		names = append(names, u.Name)
	}
	return names
}

func extractServiceTypes(cfg *config.Config) []string {
	typeSet := make(map[string]bool)
	for _, p := range cfg.Providers {
		for _, s := range p.Services {
			typeSet[s.Type] = true
		}
	}
	types := make([]string, 0, len(typeSet))
	for t := range typeSet {
		types = append(types, t)
	}
	return types
}

func writeError(w http.ResponseWriter, status int, err error) {
	resp := map[string]string{"error": err.Error()}
	data, marshalErr := json.Marshal(resp)
	if marshalErr != nil {
		http.Error(w, http.StatusText(status), status)
		return
	}
	w.Header().Set("Content-Type", jsonContentType)
	w.WriteHeader(status)
	_, _ = w.Write(data)
}

func matchPath(actual, expected string) bool {
	if actual == expected {
		return true
	}
	if strings.HasSuffix(actual, "/") {
		actual = strings.TrimSuffix(actual, "/")
	}
	return actual == expected
}
