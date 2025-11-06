package logging

import (
	"sync"
	"time"
)

// RequestLogEntry represents a single request log entry
type RequestLogEntry struct {
	Timestamp        time.Time `json:"timestamp"`
	RequestID        string    `json:"request_id"`
	User             string    `json:"user"`
	ServiceType      string    `json:"service_type"`
	Provider         string    `json:"provider"`
	ProviderKey      string    `json:"provider_key"`
	Method           string    `json:"method"`
	Path             string    `json:"path"`
	UpstreamURL      string    `json:"upstream_url"`
	StatusCode       int       `json:"status_code"`
	LatencyMs        int64     `json:"latency_ms"`
	Error            string    `json:"error,omitempty"`
}

// RequestLogStore is a thread-safe circular buffer for storing request logs
type RequestLogStore struct {
	mu       sync.RWMutex
	logs     []RequestLogEntry
	capacity int
	index    int
	size     int
}

// NewRequestLogStore creates a new request log store with the given capacity
func NewRequestLogStore(capacity int) *RequestLogStore {
	if capacity <= 0 {
		capacity = 1000 // default capacity
	}
	return &RequestLogStore{
		logs:     make([]RequestLogEntry, capacity),
		capacity: capacity,
		index:    0,
		size:     0,
	}
}

// Add appends a new log entry to the store
func (s *RequestLogStore) Add(entry RequestLogEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.logs[s.index] = entry
	s.index = (s.index + 1) % s.capacity
	if s.size < s.capacity {
		s.size++
	}
}

// QueryOptions defines filtering options for log queries
type QueryOptions struct {
	Provider    string
	User        string
	ServiceType string
	Limit       int
}

// Query retrieves logs matching the given options
// Returns logs in reverse chronological order (newest first)
func (s *RequestLogStore) Query(opts QueryOptions) []RequestLogEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.size == 0 {
		return []RequestLogEntry{}
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 100 // default limit
	}

	result := make([]RequestLogEntry, 0, limit)

	// Iterate in reverse chronological order
	for i := 0; i < s.size && len(result) < limit; i++ {
		// Calculate the index in reverse order
		idx := (s.index - 1 - i + s.capacity) % s.capacity
		entry := s.logs[idx]

		// Apply filters
		if opts.Provider != "" && entry.Provider != opts.Provider {
			continue
		}
		if opts.User != "" && entry.User != opts.User {
			continue
		}
		if opts.ServiceType != "" && entry.ServiceType != opts.ServiceType {
			continue
		}

		result = append(result, entry)
	}

	return result
}

// GetStats returns basic statistics about the stored logs
func (s *RequestLogStore) GetStats() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := map[string]interface{}{
		"total_stored": s.size,
		"capacity":     s.capacity,
	}

	return stats
}

// Clear removes all logs from the store
func (s *RequestLogStore) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.logs = make([]RequestLogEntry, s.capacity)
	s.index = 0
	s.size = 0
}
