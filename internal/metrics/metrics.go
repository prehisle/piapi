package metrics

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	registerOnce sync.Once

	cfgMu sync.RWMutex
	cfg   Config

	requestCounter             *prometheus.CounterVec
	requestDuration            *prometheus.HistogramVec
	configReloadCounters       *prometheus.CounterVec
	candidateRequestCounter    *prometheus.CounterVec
	candidateErrorCounter      *prometheus.CounterVec
	candidateRequestKeyCounter *prometheus.CounterVec
	candidateErrorKeyCounter   *prometheus.CounterVec
)

// Config controls optional behaviours of the metrics package.
type Config struct {
	// EnableCandidateKeyLabels toggles registration of key-level candidate metrics.
	EnableCandidateKeyLabels bool
}

// Configure updates runtime configuration for metrics collection.
// It should be invoked before any metrics are observed.
func Configure(c Config) {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	cfg = c
}

func ensureRegistered() {
	registerOnce.Do(func() {
		cfgMu.RLock()
		includeKeyLabels := cfg.EnableCandidateKeyLabels
		cfgMu.RUnlock()

		requestCounter = prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "piapi",
			Name:      "requests_total",
			Help:      "Total number of processed requests partitioned by service type and status class.",
		}, []string{"service_type", "status_class"})

		requestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "piapi",
			Name:      "request_latency_seconds",
			Help:      "Observed latency of proxied requests.",
			Buckets:   prometheus.DefBuckets,
		}, []string{"service_type"})

		configReloadCounters = prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "piapi",
			Name:      "config_reloads_total",
			Help:      "Count of configuration reload outcomes partitioned by result (success/failure).",
		}, []string{"result"})

		candidateRequestCounter = prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "piapi",
			Name:      "candidate_requests_total",
			Help:      "Total number of upstream candidate invocations partitioned by service type and provider.",
		}, []string{"service_type", "provider"})

		candidateErrorCounter = prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "piapi",
			Name:      "candidate_errors_total",
			Help:      "Total number of upstream candidate errors partitioned by service type and provider.",
		}, []string{"service_type", "provider"})

		collectors := []prometheus.Collector{requestCounter, requestDuration, configReloadCounters, candidateRequestCounter, candidateErrorCounter}

		if includeKeyLabels {
			candidateRequestKeyCounter = prometheus.NewCounterVec(prometheus.CounterOpts{
				Namespace: "piapi",
				Name:      "candidate_requests_by_key_total",
				Help:      "Total upstream candidate invocations partitioned by service type, provider, and key name.",
			}, []string{"service_type", "provider", "provider_key"})

			candidateErrorKeyCounter = prometheus.NewCounterVec(prometheus.CounterOpts{
				Namespace: "piapi",
				Name:      "candidate_errors_by_key_total",
				Help:      "Total upstream candidate errors partitioned by service type, provider, and key name.",
			}, []string{"service_type", "provider", "provider_key"})

			collectors = append(collectors, candidateRequestKeyCounter, candidateErrorKeyCounter)
		}

		prometheus.MustRegister(collectors...)
	})
}

// ObserveRequest records metrics for an incoming request.
func ObserveRequest(serviceType string, status int, latency time.Duration) {
	ensureRegistered()
	statusClass := fmt.Sprintf("%dxx", status/100)
	if serviceType == "" {
		serviceType = "unknown"
	}
	requestCounter.WithLabelValues(serviceType, statusClass).Inc()
	requestDuration.WithLabelValues(serviceType).Observe(latency.Seconds())
}

// ObserveConfigReload increments success/failure counters for config reload attempts.
func ObserveConfigReload(success bool) {
	ensureRegistered()
	result := "failure"
	if success {
		result = "success"
	}
	configReloadCounters.WithLabelValues(result).Inc()
}

// ObserveCandidateResult records metrics for an upstream candidate invocation.
func ObserveCandidateResult(serviceType, provider, providerKey string, status int, err error) {
	ensureRegistered()
	if serviceType == "" {
		serviceType = "unknown"
	}
	if provider == "" {
		provider = "unknown"
	}

	failure := err != nil || status == 0 || status >= 500

	candidateRequestCounter.WithLabelValues(serviceType, provider).Inc()
	if failure {
		candidateErrorCounter.WithLabelValues(serviceType, provider).Inc()
	}

	cfgMu.RLock()
	includeKeyLabels := cfg.EnableCandidateKeyLabels
	cfgMu.RUnlock()

	if includeKeyLabels && candidateRequestKeyCounter != nil && candidateErrorKeyCounter != nil {
		if providerKey == "" {
			providerKey = "unknown"
		}
		candidateRequestKeyCounter.WithLabelValues(serviceType, provider, providerKey).Inc()
		if failure {
			candidateErrorKeyCounter.WithLabelValues(serviceType, provider, providerKey).Inc()
		}
	}
}

// Handler exposes the metrics endpoint compatible with Prometheus scraping.
func Handler() http.Handler {
	ensureRegistered()
	return promhttp.Handler()
}
