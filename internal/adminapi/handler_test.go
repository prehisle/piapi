package adminapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"go.uber.org/zap"

	"piapi/internal/config"
)

const sampleConfig = `
providers:
  - name: provider-alpha
    apiKeys:
      main-key: sk-alpha-xxx
    services:
      - type: codex
        baseUrl: https://alpha.example.com
        auth:
          mode: header
          name: Authorization
          prefix: "Bearer "

users:
  - name: Alice
    apiKey: piapi-user-alice
    services:
      codex:
        providerName: provider-alpha
        providerKeyName: main-key
`

func newTestHandlerWithConfig(t *testing.T, yaml string) (*Handler, string, *config.Manager) {
	t.Helper()
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(cfgPath, []byte(yaml), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	manager := config.NewManager()
	if err := manager.LoadFromFile(cfgPath); err != nil {
		t.Fatalf("load config: %v", err)
	}

	handler := NewHandler(manager, cfgPath, "secret-token", zap.NewNop())
	return handler, cfgPath, manager
}

func newTestHandler(t *testing.T) (*Handler, string) {
	handler, path, _ := newTestHandlerWithConfig(t, sampleConfig)
	return handler, path
}

func TestHandler_Unauthorized(t *testing.T) {
	handler, _ := newTestHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/config/raw", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rr.Code)
	}
}

func TestHandler_GetConfigRaw(t *testing.T) {
	handler, cfgPath := newTestHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/config/raw", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}
	if got := rr.Header().Get("Content-Type"); got != yamlContentType {
		t.Fatalf("unexpected content type: %s", got)
	}

	want, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}

	if rr.Body.String() != string(want) {
		t.Fatalf("response mismatch")
	}
}

func TestHandler_GetConfigStructured(t *testing.T) {
	handler, _ := newTestHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/config", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}
	if got := rr.Header().Get("Content-Type"); got != jsonContentType {
		t.Fatalf("unexpected content type: %s", got)
	}
	if !strings.Contains(rr.Body.String(), `"providers":[`) {
		t.Fatalf("expected providers in structured response")
	}
}

func TestHandler_PutConfigRaw_Valid(t *testing.T) {
	handler, cfgPath := newTestHandler(t)

	newConfig := strings.ReplaceAll(sampleConfig, "https://alpha.example.com", "https://alpha-updated.example.com")

	req := httptest.NewRequest(http.MethodPut, "/config/raw", strings.NewReader(newConfig))
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", rr.Code)
	}

	content, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if !strings.Contains(string(content), "alpha-updated") {
		t.Fatalf("config file not updated")
	}

	current := handler.manager.Current()
	if current == nil || len(current.Providers) == 0 || current.Providers[0].Services[0].BaseURL != "https://alpha-updated.example.com" {
		t.Fatalf("manager not reloaded with new config")
	}
}

func TestHandler_PutConfigRaw_Invalid(t *testing.T) {
	handler, cfgPath := newTestHandler(t)

	req := httptest.NewRequest(http.MethodPut, "/config/raw", strings.NewReader("providers:\n  - name: \"\"\n    apiKeys: {}\n    services: []\nusers: []"))
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", rr.Code)
	}

	content, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if !strings.Contains(string(content), "https://alpha.example.com") {
		t.Fatalf("config file should remain unchanged on invalid payload")
	}
}

func TestHandler_AuthorizationVariants(t *testing.T) {
	handler, _ := newTestHandler(t)

	tests := []struct {
		name   string
		header string
		status int
	}{
		{"no header", "", http.StatusUnauthorized},
		{"wrong prefix", "Basic secret-token", http.StatusUnauthorized},
		{"empty token", "Bearer ", http.StatusUnauthorized},
		{"wrong token", "Bearer wrong-token", http.StatusUnauthorized},
		{"valid token", "Bearer secret-token", http.StatusOK},
		{"case insensitive bearer", "bearer secret-token", http.StatusOK},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/config/raw", nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != tt.status {
				t.Errorf("expected status %d, got %d", tt.status, rr.Code)
			}
		})
	}
}

func TestHandler_EmptyToken(t *testing.T) {
	manager := config.NewManager()
	logger := zap.NewNop()
	handler := NewHandler(manager, "", "", logger)

	req := httptest.NewRequest(http.MethodGet, "/config/raw", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404 when token is empty, got %d", rr.Code)
	}
}

func TestHandler_NotFoundRoutes(t *testing.T) {
	handler, _ := newTestHandler(t)

	tests := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/config/raw"},
		{http.MethodDelete, "/config/raw"},
		{http.MethodPost, "/config"},
		{http.MethodGet, "/unknown"},
		{http.MethodGet, "/config/something"},
	}

	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			req.Header.Set("Authorization", "Bearer secret-token")
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusNotFound {
				t.Errorf("expected 404, got %d", rr.Code)
			}
		})
	}
}

func TestHandler_PathMatching(t *testing.T) {
	handler, _ := newTestHandler(t)

	// Test with trailing slash
	req := httptest.NewRequest(http.MethodGet, "/config/raw/", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for path with trailing slash, got %d", rr.Code)
	}
}

func TestHandler_PutConfigRaw_Empty(t *testing.T) {
	handler, _ := newTestHandler(t)

	req := httptest.NewRequest(http.MethodPut, "/config/raw", strings.NewReader("   \n\t  "))
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty payload, got %d", rr.Code)
	}
}

func TestHandler_PutConfigRaw_InvalidYAML(t *testing.T) {
	handler, _ := newTestHandler(t)

	req := httptest.NewRequest(http.MethodPut, "/config/raw", strings.NewReader("not: [valid: yaml"))
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid YAML, got %d", rr.Code)
	}
}

func TestHandler_GetConfigRaw_FileError(t *testing.T) {
	handler, cfgPath := newTestHandler(t)

	// Remove the config file to trigger read error
	os.Remove(cfgPath)

	req := httptest.NewRequest(http.MethodGet, "/config/raw", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 when file doesn't exist, got %d", rr.Code)
	}
}

func TestHandler_GetConfigStructured_NilConfig(t *testing.T) {
	// Create handler with empty manager (no config loaded)
	manager := config.NewManager()
	logger := zap.NewNop()
	handler := NewHandler(manager, "/tmp/nonexistent.yaml", "secret-token", logger)

	req := httptest.NewRequest(http.MethodGet, "/config", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 when config is nil, got %d", rr.Code)
	}
}

func TestHandler_PutConfigRaw_DuplicateProviders(t *testing.T) {
	handler, cfgPath := newTestHandler(t)

	// Create a config with duplicate provider names (caught during parsing)
	badConfig := `
providers:
  - name: provider-alpha
    apiKeys:
      main-key: sk-alpha-xxx
    services:
      - type: codex
        baseUrl: https://alpha.example.com
        auth:
          mode: header
          name: Authorization
          prefix: "Bearer "
  - name: provider-alpha
    apiKeys:
      main-key: sk-beta-xxx
    services:
      - type: codex
        baseUrl: https://beta.example.com
        auth:
          mode: header
          name: Authorization
          prefix: "Bearer "

users:
  - name: Alice
    apiKey: piapi-user-alice
    services:
      codex:
        providerName: provider-alpha
        providerKeyName: main-key
`

	req := httptest.NewRequest(http.MethodPut, "/config/raw", strings.NewReader(badConfig))
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	// Should fail with bad request due to duplicate provider names
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for duplicate providers, got %d", rr.Code)
	}

	// Verify original config was not changed
	content, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if !strings.Contains(string(content), "https://alpha.example.com") {
		t.Errorf("original config should remain unchanged")
	}
}

func TestHandler_PutConfigRaw_TooLarge(t *testing.T) {
	handler, _ := newTestHandler(t)

	// Create payload larger than maxConfigPayloadSize
	largePayload := strings.Repeat("x", 2*1024*1024) // 2 MiB

	req := httptest.NewRequest(http.MethodPut, "/config/raw", strings.NewReader(largePayload))
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for too large payload, got %d", rr.Code)
	}
}

func TestHandler_GetRouteStats(t *testing.T) {
	yaml := `
providers:
  - name: provider-alpha
    apiKeys:
      main: key-1
      backup: key-2
    services:
      - type: codex
        baseUrl: https://alpha.example.com/v1
  - name: provider-beta
    apiKeys:
      canary: key-3
    services:
      - type: codex
        baseUrl: https://beta.example.com/v1
users:
  - name: agg
    apiKey: agg-key
    services:
      codex:
        strategy: weighted_rr
        candidates:
          - providerName: provider-alpha
            providerKeyName: main
            weight: 3
          - providerName: provider-beta
            providerKeyName: canary
            weight: 1
`

	handler, _, manager := newTestHandlerWithConfig(t, yaml)

	manager.ReportResult("agg-key", "codex", "provider-alpha", "main", 200, nil)
	manager.ReportResult("agg-key", "codex", "provider-alpha", "main", 503, nil)
	manager.ReportResult("agg-key", "codex", "provider-beta", "canary", 503, nil)

	req := httptest.NewRequest(http.MethodGet, "/stats/routes?apiKey=agg-key&service=codex", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}
	if got := rr.Header().Get("Content-Type"); got != jsonContentType {
		t.Fatalf("unexpected content type: %s", got)
	}

	var payload []config.CandidateRuntimeStatus
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal stats: %v", err)
	}
	if len(payload) != 2 {
		t.Fatalf("expected 2 stats entries, got %d", len(payload))
	}

	var alpha, beta *config.CandidateRuntimeStatus
	for i := range payload {
		switch payload[i].ProviderName {
		case "provider-alpha":
			alpha = &payload[i]
		case "provider-beta":
			beta = &payload[i]
		}
	}
	if alpha == nil || beta == nil {
		t.Fatalf("missing providers in stats: %+v", payload)
	}

	if alpha.TotalRequests != 2 || alpha.TotalErrors != 1 || alpha.Healthy {
		t.Fatalf("unexpected alpha stats: %+v", alpha)
	}
	if beta.TotalRequests != 1 || beta.TotalErrors != 1 || beta.Healthy {
		t.Fatalf("unexpected beta stats: %+v", beta)
	}

	badReq := httptest.NewRequest(http.MethodGet, "/stats/routes?apiKey=agg-key", nil)
	badReq.Header.Set("Authorization", "Bearer secret-token")
	badRR := httptest.NewRecorder()
	handler.ServeHTTP(badRR, badReq)
	if badRR.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing service, got %d", badRR.Code)
	}
}
