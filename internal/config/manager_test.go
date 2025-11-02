package config

import (
	"context"
	"errors"
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
      - type: cx
        baseUrl: https://api.example.com/v1
      - type: cc
        baseUrl: https://api.example.com/v1/claude
        auth:
          mode: query
          name: api_key
  - name: provider-beta
    apiKeys:
      prod-key: another-upstream
    services:
      - type: cx
        baseUrl: https://beta.example.com/api
        auth:
          mode: header
          name: X-API-KEY
          prefix: ""
users:
  - name: test user
    apiKey: user-secret
    providerName: provider-alpha
    providerKeyName: main-key
`

	path := writeTempConfig(t, yaml)

	manager := NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	route, err := manager.Resolve("user-secret", "cx")
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

	if got := manager.ListServiceTypes(); len(got) != 2 || got[0] != "cc" || got[1] != "cx" {
		t.Fatalf("unexpected service types: %v", got)
	}

	// Query auth should be preserved for cc service
	ccRoute, err := manager.Resolve("user-secret", "cc")
	if err != nil {
		t.Fatalf("resolve cc: %v", err)
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
      - type: cx
        baseUrl: https://api.example.com/v1
users:
  - name: test user
    apiKey: user-secret
    providerName: provider-alpha
    providerKeyName: main-key
`

	path := writeTempConfig(t, yaml)

	manager := NewManager()
	if err := manager.LoadFromFile(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	if _, err := manager.Resolve("missing", "cx"); err == nil || err != ErrUserNotFound {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}

	if _, err := manager.Resolve("user-secret", "unknown"); err == nil || !errors.Is(err, ErrServiceNotFound) {
		t.Fatalf("expected service not found error, got %v", err)
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
      - type: cx
        baseUrl: https://api.example.com/v1
users:
  - name: tester
    apiKey: user-secret
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

	route, err := manager.Resolve("user-secret", "cx")
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
      - type: cx
        baseUrl: https://api.example.com/v1
users:
  - name: tester
    apiKey: user-secret
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
			route, err := manager.Resolve("user-secret", "cx")
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
      - type: cx
        baseUrl: https://api.example.com/v1
users:
  - name: tester
    apiKey: user-secret
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

	route, err := manager.Resolve("user-secret", "cx")
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
