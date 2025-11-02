package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestObserveRequest(t *testing.T) {
	tests := []struct {
		name        string
		serviceType string
		status      int
		latency     time.Duration
	}{
		{
			name:        "200 response",
			serviceType: "test_service",
			status:      200,
			latency:     100 * time.Millisecond,
		},
		{
			name:        "404 response",
			serviceType: "test_service",
			status:      404,
			latency:     50 * time.Millisecond,
		},
		{
			name:        "500 response",
			serviceType: "another_service",
			status:      500,
			latency:     200 * time.Millisecond,
		},
		{
			name:        "empty service type",
			serviceType: "",
			status:      200,
			latency:     10 * time.Millisecond,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Should not panic
			ObserveRequest(tt.serviceType, tt.status, tt.latency)
		})
	}
}

func TestObserveConfigReload(t *testing.T) {
	tests := []struct {
		name    string
		success bool
	}{
		{
			name:    "successful reload",
			success: true,
		},
		{
			name:    "failed reload",
			success: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Should not panic
			ObserveConfigReload(tt.success)
		})
	}
}

func TestHandler(t *testing.T) {
	// Record some test metrics
	ObserveRequest("test_service", 200, 100*time.Millisecond)
	ObserveRequest("test_service", 404, 50*time.Millisecond)
	ObserveConfigReload(true)
	ObserveConfigReload(false)

	handler := Handler()
	if handler == nil {
		t.Fatal("Handler() returned nil")
	}

	// Make a test request to the handler
	req := httptest.NewRequest("GET", "/metrics", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rec.Code)
	}

	body := rec.Body.String()

	// Check that metrics are present in the output
	expectedMetrics := []string{
		"piapi_requests_total",
		"piapi_request_latency_seconds",
		"piapi_config_reloads_total",
	}

	for _, metric := range expectedMetrics {
		if !strings.Contains(body, metric) {
			t.Errorf("Expected metric %q not found in output", metric)
		}
	}
}

func TestHandlerContentType(t *testing.T) {
	handler := Handler()
	req := httptest.NewRequest("GET", "/metrics", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	contentType := rec.Header().Get("Content-Type")
	if !strings.Contains(contentType, "text/plain") {
		t.Errorf("Expected Content-Type to contain text/plain, got %q", contentType)
	}
}

func TestObserveRequestStatusClasses(t *testing.T) {
	// Test different status classes
	statusTests := []struct {
		status       int
		expectedClass string
	}{
		{200, "2xx"},
		{201, "2xx"},
		{400, "4xx"},
		{404, "4xx"},
		{500, "5xx"},
		{502, "5xx"},
	}

	for _, tt := range statusTests {
		t.Run(tt.expectedClass, func(t *testing.T) {
			ObserveRequest("test", tt.status, time.Millisecond)
		})
	}

	// Verify metrics are exported
	handler := Handler()
	req := httptest.NewRequest("GET", "/metrics", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	body := rec.Body.String()
	for _, tt := range statusTests {
		// Check that status class appears in metrics
		if !strings.Contains(body, tt.expectedClass) {
			t.Errorf("Expected status class %q not found in metrics", tt.expectedClass)
		}
	}
}

func TestMultipleCalls(t *testing.T) {
	// Test that multiple calls work correctly
	for i := 0; i < 100; i++ {
		ObserveRequest("bulk_test", 200, time.Millisecond)
	}

	for i := 0; i < 50; i++ {
		ObserveConfigReload(true)
	}

	handler := Handler()
	req := httptest.NewRequest("GET", "/metrics", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Expected status %d after multiple calls, got %d", http.StatusOK, rec.Code)
	}
}
