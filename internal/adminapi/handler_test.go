package adminapi

import (
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

func newTestHandler(t *testing.T) (*Handler, string) {
	t.Helper()
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(cfgPath, []byte(sampleConfig), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	manager := config.NewManager()
	if err := manager.LoadFromFile(cfgPath); err != nil {
		t.Fatalf("load config: %v", err)
	}

	logger := zap.NewNop()
	handler := NewHandler(manager, cfgPath, "secret-token", logger)
	return handler, cfgPath
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
	if !strings.Contains(rr.Body.String(), `"Providers":[`) {
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
