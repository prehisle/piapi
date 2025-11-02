package server

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"go.uber.org/zap"

	"piapi/internal/config"
	"piapi/internal/metrics"
)

func TestGatewayProxiesWithHeaderAuth(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/foo" {
			t.Errorf("unexpected upstream path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer upstream-key" {
			t.Errorf("unexpected upstream Authorization header: %s", r.Header.Get("Authorization"))
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()

	yaml := fmt.Sprintf(`
providers:
  - name: upstream
    apiKeys:
      main: upstream-key
    services:
      - type: codex
        baseUrl: %s/v1
users:
  - name: tester
    apiKey: user-key
    services:
      codex:
        providerName: upstream
        providerKeyName: main
`, upstream.URL)

	path := writeTempConfig(t, yaml)

	manager := config.NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	gateway := &Gateway{Config: manager}

	req := httptest.NewRequest(http.MethodGet, "/piapi/codex/foo", nil)
	req.Header.Set("Authorization", "Bearer user-key")
	rr := httptest.NewRecorder()

	gateway.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("unexpected status: %d", rr.Code)
	}
}

func TestGatewayProxiesWithQueryAuth(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("api_key"); got != "secret" {
			t.Fatalf("expected api_key query param, got %s", got)
		}
		if auth := r.Header.Get("Authorization"); auth != "" {
			t.Fatalf("expected Authorization header stripped, got %s", auth)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	yaml := fmt.Sprintf(`
providers:
  - name: upstream
    apiKeys:
      main: secret
    services:
      - type: claude_code
        baseUrl: %s
        auth:
          mode: query
          name: api_key
users:
  - name: tester
    apiKey: user-key
    services:
      claude_code:
        providerName: upstream
        providerKeyName: main
`, upstream.URL)

	path := writeTempConfig(t, yaml)

	manager := config.NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	gateway := &Gateway{Config: manager}

	req := httptest.NewRequest(http.MethodPost, "/piapi/claude_code", nil)
	req.Header.Set("Authorization", "Bearer user-key")
	rr := httptest.NewRecorder()

	gateway.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", rr.Code)
	}
	if body := rr.Body.String(); body != "ok" {
		t.Fatalf("unexpected body: %s", body)
	}
}

func TestGatewayRejectsMissingAuth(t *testing.T) {
	yaml := `
providers:
  - name: upstream
    apiKeys:
      main: secret
    services:
      - type: codex
        baseUrl: https://example.com
users:
  - name: tester
    apiKey: user-key
    services:
      codex:
        providerName: upstream
        providerKeyName: main
`

	path := writeTempConfig(t, yaml)

	manager := config.NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	gateway := &Gateway{Config: manager}

	req := httptest.NewRequest(http.MethodGet, "/piapi/codex/foo", nil)
	rr := httptest.NewRecorder()

	gateway.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing auth, got %d", rr.Code)
	}
}

func TestGatewayUnknownServiceReturnsNotFound(t *testing.T) {
	yaml := `
providers:
  - name: upstream
    apiKeys:
      main: secret
    services:
      - type: codex
        baseUrl: https://example.com
users:
  - name: tester
    apiKey: user-key
    services:
      codex:
        providerName: upstream
        providerKeyName: main
`

	path := writeTempConfig(t, yaml)

	manager := config.NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	gateway := &Gateway{Config: manager}

	req := httptest.NewRequest(http.MethodGet, "/piapi/unknown/foo", nil)
	req.Header.Set("Authorization", "Bearer user-key")
	rr := httptest.NewRecorder()

	gateway.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown service type, got %d", rr.Code)
	}
}

func writeTempConfig(t *testing.T, contents string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatalf("write temp config: %v", err)
	}
	return path
}

func TestGatewayHotReloadAndMetrics(t *testing.T) {
	upstreamHits := make(chan string, 2)

	upstream1 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits <- "one:" + r.URL.Path
		if r.Header.Get("Authorization") != "Bearer first-key" {
			t.Fatalf("unexpected auth header: %s", r.Header.Get("Authorization"))
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream1.Close()

	upstream2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits <- "two:" + r.URL.Path
		if r.URL.Query().Get("api_key") != "second-key" {
			t.Fatalf("expected api_key second-key, got %s", r.URL.Query().Get("api_key"))
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("updated"))
	}))
	defer upstream2.Close()

	initial := fmt.Sprintf(`
providers:
  - name: upstream
    apiKeys:
      main: first-key
    services:
      - type: codex
        baseUrl: %s
users:
  - name: tester
    apiKey: user-key
    services:
      codex:
        providerName: upstream
        providerKeyName: main
`, upstream1.URL)

	path := writeTempConfig(t, initial)

	manager := config.NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load initial config: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := config.WatchFile(ctx, manager, path, nil); err != nil {
		t.Fatalf("start watcher: %v", err)
	}

	gw := &Gateway{Config: manager, Logger: zap.NewNop()}
	mux := http.NewServeMux()
	mux.Handle("/piapi/", RequestIDMiddleware(gw))
	mux.Handle("/metrics", metrics.Handler())

	serverCtx, serverCancel := context.WithCancel(context.Background())
	defer serverCancel()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	srv := &http.Server{Handler: mux}

	go func() {
		<-serverCtx.Done()
		_ = srv.Shutdown(context.Background())
	}()

	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Errorf("serve: %v", err)
		}
	}()

	client := &http.Client{Timeout: 2 * time.Second}
	baseURL := "http://" + ln.Addr().String()

	req, _ := http.NewRequest(http.MethodGet, baseURL+"/piapi/codex/foo", nil)
	req.Header.Set("Authorization", "Bearer user-key")
	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("request error: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status: %d", res.StatusCode)
	}

	select {
	case hit := <-upstreamHits:
		if !strings.HasPrefix(hit, "one:") {
			t.Fatalf("expected upstream1 hit, got %s", hit)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timeout waiting for upstream hit")
	}

	metricsRes, err := client.Get(baseURL + "/metrics")
	if err != nil {
		t.Fatalf("fetch metrics: %v", err)
	}
	metricsBody, _ := io.ReadAll(metricsRes.Body)
	metricsRes.Body.Close()
	if !bytes.Contains(metricsBody, []byte("piapi_requests_total")) {
		t.Fatalf("metrics missing requests_total: %s", string(metricsBody))
	}

	updated := fmt.Sprintf(`
providers:
  - name: upstream
    apiKeys:
      main: second-key
    services:
      - type: codex
        baseUrl: %s
        auth:
          mode: query
          name: api_key
users:
  - name: tester
    apiKey: user-key
    services:
      codex:
        providerName: upstream
        providerKeyName: main
`, upstream2.URL)

	if err := os.WriteFile(path, []byte(updated), 0o600); err != nil {
		t.Fatalf("write updated config: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	var routedToSecond bool
	for time.Now().Before(deadline) && !routedToSecond {
		req2, _ := http.NewRequest(http.MethodPost, baseURL+"/piapi/codex/bar", nil)
		req2.Header.Set("Authorization", "Bearer user-key")
		res2, err := client.Do(req2)
		if err == nil {
			res2.Body.Close()
		}

		timer := time.NewTimer(200 * time.Millisecond)
		select {
		case hit := <-upstreamHits:
			if strings.HasPrefix(hit, "two:") {
				routedToSecond = true
			}
		case <-timer.C:
		}
		if !timer.Stop() {
			<-timer.C
		}
		time.Sleep(50 * time.Millisecond)
	}

	if !routedToSecond {
		t.Fatalf("expected upstream2 hit after config reload")
	}
}
