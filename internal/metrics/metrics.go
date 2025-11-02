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

	requestCounter       *prometheus.CounterVec
	requestDuration      *prometheus.HistogramVec
	configReloadCounters *prometheus.CounterVec
)

func ensureRegistered() {
	registerOnce.Do(func() {
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

		prometheus.MustRegister(requestCounter, requestDuration, configReloadCounters)
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

// Handler exposes the metrics endpoint compatible with Prometheus scraping.
func Handler() http.Handler {
	ensureRegistered()
	return promhttp.Handler()
}
