package config

import (
	"context"
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestManagerLoadAndResolve(t *testing.T) {
	yaml := `
providers:
  - name: provider-alpha
    apiKeys:
      main-key: test-upstream-key
    services:
      - type: codex
        baseUrl: https://api.example.com/v1
      - type: claude_code
        baseUrl: https://api.example.com/v1/claude
        auth:
          mode: query
          name: api_key
  - name: provider-beta
    apiKeys:
      prod-key: another-upstream
    services:
      - type: codex
        baseUrl: https://beta.example.com/api
        auth:
          mode: header
          name: X-API-KEY
          prefix: ""
users:
  - name: test user
    apiKey: user-secret
    services:
      codex:
        providerName: provider-alpha
        providerKeyName: main-key
      claude_code:
        providerName: provider-alpha
        providerKeyName: main-key
`

	path := writeTempConfig(t, yaml)

	manager := NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	route, err := manager.Resolve("user-secret", "codex")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	if route.Provider.Name != "provider-alpha" {
		t.Fatalf("expected provider-alpha got %s", route.Provider.Name)
	}

	if route.UpstreamKeyValue != "test-upstream-key" {
		t.Fatalf("unexpected upstream key: %s", route.UpstreamKeyValue)
	}

	if route.Service.BaseURL != "https://api.example.com/v1" {
		t.Fatalf("unexpected base url: %s", route.Service.BaseURL)
	}

	if route.Service.Auth == nil {
		t.Fatal("expected default auth configuration for codex service")
	}
	if route.Service.Auth.Mode != AuthModeHeader || route.Service.Auth.Name != "Authorization" || route.Service.Auth.Prefix != "Bearer " {
		t.Fatalf("unexpected default auth: %#v", route.Service.Auth)
	}

	if got := manager.ListServiceTypes(); len(got) != 2 || got[0] != "claude_code" || got[1] != "codex" {
		t.Fatalf("unexpected service types: %v", got)
	}

	// Query auth should be preserved for claude_code service
	ccRoute, err := manager.Resolve("user-secret", "claude_code")
	if err != nil {
		t.Fatalf("resolve claude_code: %v", err)
	}
	if ccRoute.Service.Auth == nil || ccRoute.Service.Auth.Mode != AuthModeQuery || ccRoute.Service.Auth.Name != "api_key" {
		t.Fatalf("expected query auth configuration, got %#v", ccRoute.Service.Auth)
	}
}

func TestManagerResolveErrors(t *testing.T) {
	yaml := `
providers:
  - name: provider-alpha
    apiKeys:
      main-key: test-upstream-key
    services:
      - type: codex
        baseUrl: https://api.example.com/v1
users:
  - name: test user
    apiKey: user-secret
    services:
      codex:
        providerName: provider-alpha
        providerKeyName: main-key
`

	path := writeTempConfig(t, yaml)

	manager := NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	if _, err := manager.Resolve("missing", "codex"); err == nil || err != ErrUserNotFound {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}

	if _, err := manager.Resolve("user-secret", "unknown"); err == nil || !errors.Is(err, ErrServiceNotFound) {
		t.Fatalf("expected service not found error, got %v", err)
	}
}

func TestResolveAggregatedRoundRobin(t *testing.T) {
	yaml := `
providers:
  - name: provider-alpha
    apiKeys:
      primary: key-1
      secondary: key-2
    services:
      - type: codex
        baseUrl: https://alpha.example.com/v1
users:
  - name: agg
    apiKey: agg-key
    services:
      codex:
        strategy: round_robin
        candidates:
          - providerName: provider-alpha
            providerKeyName: primary
          - providerName: provider-alpha
            providerKeyName: secondary
`

	path := writeTempConfig(t, yaml)
	manager := NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	route1, err := manager.Resolve("agg-key", "codex")
	if err != nil {
		t.Fatalf("resolve first: %v", err)
	}
	if route1.UpstreamKeyName != "primary" {
		t.Fatalf("expected primary, got %s", route1.UpstreamKeyName)
	}

	route2, err := manager.Resolve("agg-key", "codex")
	if err != nil {
		t.Fatalf("resolve second: %v", err)
	}
	if route2.UpstreamKeyName != "secondary" {
		t.Fatalf("expected secondary, got %s", route2.UpstreamKeyName)
	}

	// Mark primary as unhealthy and ensure secondary is chosen.
	manager.ReportResult("agg-key", "codex", route1.Provider.Name, route1.UpstreamKeyName, 503, nil)

	route3, err := manager.Resolve("agg-key", "codex")
	if err != nil {
		t.Fatalf("resolve third: %v", err)
	}
	if route3.UpstreamKeyName != "secondary" {
		t.Fatalf("expected fallback to secondary, got %s", route3.UpstreamKeyName)
	}

	// Mark secondary unhealthy as well → expect no active upstream
	manager.ReportResult("agg-key", "codex", route3.Provider.Name, route3.UpstreamKeyName, 503, nil)

	if _, err := manager.Resolve("agg-key", "codex"); err == nil || !errors.Is(err, ErrNoActiveUpstream) {
		t.Fatalf("expected ErrNoActiveUpstream, got %v", err)
	}
}

func TestResolveAggregatedWeighted(t *testing.T) {
	yaml := `
providers:
  - name: provider-alpha
    apiKeys:
      main: key-1
    services:
      - type: codex
        baseUrl: https://alpha.example.com/v1
  - name: provider-beta
    apiKeys:
      backup: key-2
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
            providerKeyName: backup
            weight: 1
`

	path := writeTempConfig(t, yaml)
	manager := NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	sequence := make([]string, 0, 8)
	for i := 0; i < 8; i++ {
		route, err := manager.Resolve("agg-key", "codex")
		if err != nil {
			t.Fatalf("resolve seq %d: %v", i, err)
		}
		sequence = append(sequence, route.Provider.Name)
	}

	expectedCycle := []string{"provider-alpha", "provider-alpha", "provider-alpha", "provider-beta"}
	for i, name := range sequence {
		if name != expectedCycle[i%len(expectedCycle)] {
			t.Fatalf("unexpected provider at %d: got %s want %s", i, name, expectedCycle[i%len(expectedCycle)])
		}
	}
}

func TestRuntimeStatusReporting(t *testing.T) {
	yaml := `
providers:
  - name: provider-alpha
    apiKeys:
      main: key-1
    services:
      - type: codex
        baseUrl: https://alpha.example.com/v1
  - name: provider-beta
    apiKeys:
      backup: key-2
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
            weight: 2
            tags: ["primary"]
          - providerName: provider-beta
            providerKeyName: backup
            weight: 1
            tags: ["canary"]
`

	path := writeTempConfig(t, yaml)
	manager := NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	manager.ReportResult("agg-key", "codex", "provider-alpha", "main", 200, nil)
	manager.ReportResult("agg-key", "codex", "provider-alpha", "main", 503, nil)
	manager.ReportResult("agg-key", "codex", "provider-beta", "backup", 0, errors.New("timeout"))

	stats, err := manager.RuntimeStatus("agg-key", "codex")
	if err != nil {
		t.Fatalf("runtime status: %v", err)
	}
	if len(stats) != 2 {
		t.Fatalf("expected 2 candidates, got %d", len(stats))
	}

	var alpha, beta *CandidateRuntimeStatus
	for i := range stats {
		switch stats[i].ProviderName {
		case "provider-alpha":
			alpha = &stats[i]
		case "provider-beta":
			beta = &stats[i]
		}
	}

	if alpha == nil || beta == nil {
		t.Fatalf("missing candidate stats: %v", stats)
	}

	if alpha.TotalRequests != 2 || alpha.TotalErrors != 1 {
		t.Fatalf("unexpected alpha counters: %+v", alpha)
	}
	if math.Abs(alpha.ErrorRate-0.5) > 1e-9 {
		t.Fatalf("unexpected alpha error rate: %v", alpha.ErrorRate)
	}
	if alpha.LastStatus != 503 {
		t.Fatalf("unexpected alpha last status: %d", alpha.LastStatus)
	}
	if alpha.Healthy {
		t.Fatalf("alpha should be marked unhealthy")
	}
	if len(alpha.Tags) != 1 || alpha.Tags[0] != "primary" {
		t.Fatalf("unexpected alpha tags: %v", alpha.Tags)
	}
	if alpha.LastError != "upstream status 503" {
		t.Fatalf("unexpected alpha last error: %s", alpha.LastError)
	}

	if beta.TotalRequests != 1 || beta.TotalErrors != 1 {
		t.Fatalf("unexpected beta counters: %+v", beta)
	}
	if beta.LastStatus != 0 {
		t.Fatalf("unexpected beta last status: %d", beta.LastStatus)
	}
	if beta.Healthy {
		t.Fatalf("beta should be unhealthy after error")
	}
	if len(beta.Tags) != 1 || beta.Tags[0] != "canary" {
		t.Fatalf("unexpected beta tags: %v", beta.Tags)
	}
	if beta.LastError != "timeout" {
		t.Fatalf("unexpected beta last error: %s", beta.LastError)
	}

	// Ensure error for missing apiKey
	if _, err := manager.RuntimeStatus("", "codex"); err == nil || !errors.Is(err, ErrAPIKeyRequired) {
		t.Fatalf("expected ErrAPIKeyRequired, got %v", err)
	}
}

func TestParseValidation(t *testing.T) {
	yaml := `
providers:
  - name: provider-alpha
    apiKeys: {}
    services: []
users: []
`

	if _, err := parse([]byte(yaml)); err == nil {
		t.Fatalf("expected validation error for empty apiKeys")
	}
}

func TestManagerLoadRetainsPreviousOnError(t *testing.T) {
	initial := `
providers:
  - name: provider-alpha
    apiKeys:
      main-key: good-key
    services:
      - type: codex
        baseUrl: https://api.example.com/v1
users:
  - name: tester
    apiKey: user-secret
    services:
      codex:
        providerName: provider-alpha
        providerKeyName: main-key
`

	path := writeTempConfig(t, initial)
	manager := NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load initial config: %v", err)
	}

	// Overwrite the file with an invalid configuration.
	invalid := `
providers:
  - name: provider-alpha
    apiKeys: {}
    services: []
users: []
`

	if err := os.WriteFile(path, []byte(invalid), 0o600); err != nil {
		t.Fatalf("write invalid config: %v", err)
	}

	if err := manager.LoadFromFile(path); err == nil {
		t.Fatalf("expected error when loading invalid config")
	}

	route, err := manager.Resolve("user-secret", "codex")
	if err != nil {
		t.Fatalf("resolve after failed load: %v", err)
	}
	if route.UpstreamKeyValue != "good-key" {
		t.Fatalf("unexpected upstream key after failed load: %s", route.UpstreamKeyValue)
	}
}

func TestWatchFileReloadsConfig(t *testing.T) {
	initial := `
providers:
  - name: provider-alpha
    apiKeys:
      main-key: first-key
    services:
      - type: codex
        baseUrl: https://api.example.com/v1
users:
  - name: tester
    apiKey: user-secret
    services:
      codex:
        providerName: provider-alpha
        providerKeyName: main-key
`

	path := writeTempConfig(t, initial)
	manager := NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load initial config: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := WatchFile(ctx, manager, path, nil); err != nil {
		t.Fatalf("start watcher: %v", err)
	}

	waitForKey := func(expected string) {
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			route, err := manager.Resolve("user-secret", "codex")
			if err == nil && route.UpstreamKeyValue == expected {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatalf("timeout waiting for upstream key %s", expected)
	}

	updated := `
providers:
  - name: provider-alpha
    apiKeys:
      main-key: second-key
    services:
      - type: codex
        baseUrl: https://api.example.com/v1
users:
  - name: tester
    apiKey: user-secret
    services:
      codex:
        providerName: provider-alpha
        providerKeyName: main-key
`

	if err := os.WriteFile(path, []byte(updated), 0o600); err != nil {
		t.Fatalf("write updated config: %v", err)
	}
	waitForKey("second-key")

	// Write an invalid configuration; the watcher should log an error and keep the last good config.
	invalid := `
providers:
  - name: provider-alpha
    apiKeys: {}
    services: []
users: []
`

	if err := os.WriteFile(path, []byte(invalid), 0o600); err != nil {
		t.Fatalf("write invalid config: %v", err)
	}

	// Give the watcher time to attempt and fail the reload, then ensure the key is unchanged.
	time.Sleep(200 * time.Millisecond)

	route, err := manager.Resolve("user-secret", "codex")
	if err != nil {
		t.Fatalf("resolve after invalid update: %v", err)
	}
	if route.UpstreamKeyValue != "second-key" {
		t.Fatalf("expected to retain previous key, got %s", route.UpstreamKeyValue)
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

// TestWeightedRRIntegerPath verifies that weighted_rr uses integer arithmetic
// for predictable and precise weight distribution, avoiding float precision issues.
func TestWeightedRRIntegerPath(t *testing.T) {
	yaml := `
providers:
  - name: provider-alpha
    apiKeys:
      key-a: test-key-a
    services:
      - type: codex
        baseUrl: https://alpha.example.com/v1
  - name: provider-beta
    apiKeys:
      key-b: test-key-b
    services:
      - type: codex
        baseUrl: https://beta.example.com/v1
  - name: provider-gamma
    apiKeys:
      key-c: test-key-c
    services:
      - type: codex
        baseUrl: https://gamma.example.com/v1
users:
  - name: test-user
    apiKey: test-key
    services:
      codex:
        strategy: weighted_rr
        candidates:
          - providerName: provider-alpha
            providerKeyName: key-a
            weight: 5
          - providerName: provider-beta
            providerKeyName: key-b
            weight: 3
          - providerName: provider-gamma
            providerKeyName: key-c
            weight: 2
`

	path := writeTempConfig(t, yaml)
	manager := NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	// Total weight is 5+3+2=10, so the cycle should repeat every 10 requests
	// Expected pattern: alpha(5x), beta(3x), gamma(2x)
	totalWeight := 10
	iterations := 1000 // Test multiple cycles

	counts := map[string]int{
		"provider-alpha": 0,
		"provider-beta":  0,
		"provider-gamma": 0,
	}

	for i := 0; i < iterations; i++ {
		route, err := manager.Resolve("test-key", "codex")
		if err != nil {
			t.Fatalf("resolve at iteration %d: %v", i, err)
		}
		counts[route.Provider.Name]++
	}

	// With integer arithmetic, the distribution should be exact
	expectedAlpha := (iterations * 5) / totalWeight
	expectedBeta := (iterations * 3) / totalWeight
	expectedGamma := (iterations * 2) / totalWeight

	if counts["provider-alpha"] != expectedAlpha {
		t.Errorf("alpha: expected %d, got %d", expectedAlpha, counts["provider-alpha"])
	}
	if counts["provider-beta"] != expectedBeta {
		t.Errorf("beta: expected %d, got %d", expectedBeta, counts["provider-beta"])
	}
	if counts["provider-gamma"] != expectedGamma {
		t.Errorf("gamma: expected %d, got %d", expectedGamma, counts["provider-gamma"])
	}

	// Verify the exact sequence for one full cycle
	manager2 := NewManager()
	if err := manager2.LoadFromFile(path); err != nil {
		t.Fatalf("load config for sequence test: %v", err)
	}

	expectedCycle := []string{
		"provider-alpha", "provider-alpha", "provider-alpha", "provider-alpha", "provider-alpha",
		"provider-beta", "provider-beta", "provider-beta",
		"provider-gamma", "provider-gamma",
	}

	for i := 0; i < totalWeight*2; i++ { // Test 2 full cycles
		route, err := manager2.Resolve("test-key", "codex")
		if err != nil {
			t.Fatalf("resolve for sequence at %d: %v", i, err)
		}
		expected := expectedCycle[i%totalWeight]
		if route.Provider.Name != expected {
			t.Errorf("sequence mismatch at position %d: expected %s, got %s",
				i, expected, route.Provider.Name)
		}
	}
}
