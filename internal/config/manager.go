package config

import (
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gopkg.in/yaml.v3"

	"piapi/internal/metrics"
)

// Manager stores the parsed configuration and provides concurrent-safe lookups.
type Manager struct {
	mu   sync.RWMutex
	data *resolvedConfig
}

const (
	strategyRoundRobin    = "round_robin"
	strategyWeightedRR    = "weighted_rr"
	strategyAdaptiveRR    = "adaptive_rr"
	strategyStickyHealthy = "sticky_healthy"
)

var (
	adaptiveHalfLife     = time.Minute
	adaptiveQualityFloor = 0.1
	adaptiveTauSeconds   = adaptiveHalfLife.Seconds() / math.Ln2
)

func init() {
	initAdaptiveParameters()
}

func initAdaptiveParameters() {
	if v := strings.TrimSpace(os.Getenv("PIAPI_ADAPTIVE_HALFLIFE")); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			adaptiveHalfLife = d
		}
	}
	if v := strings.TrimSpace(os.Getenv("PIAPI_ADAPTIVE_QUALITY_FLOOR")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 && f < 1 {
			adaptiveQualityFloor = f
		}
	}
	adaptiveTauSeconds = adaptiveHalfLife.Seconds() / math.Ln2
	if adaptiveTauSeconds <= 0 {
		adaptiveTauSeconds = 1
	}
	if adaptiveQualityFloor <= 0 {
		adaptiveQualityFloor = 0.1
	}
}

func atomicLoadFloat64(addr *uint64) float64 {
	return math.Float64frombits(atomic.LoadUint64(addr))
}

func atomicStoreFloat64(addr *uint64, val float64) {
	atomic.StoreUint64(addr, math.Float64bits(val))
}

// resolvedConfig is an indexed representation of Config for fast lookups.
type resolvedConfig struct {
	raw       *Config
	providers map[string]*resolvedProvider
	users     map[string]*resolvedUser
}

type resolvedProvider struct {
	provider Provider
	services map[string]Service
}

type resolvedUser struct {
	user     User
	services map[string]*resolvedUserService
}

type resolvedUserService struct {
	// aggregated routing state (covers legacy single-route as 1-candidate RR)
	strategy   string
	candidates []*resolvedCandidate
	rrCounter  uint64
	// adaptive weights / sticky state
	stickyIndex int32
}

type resolvedCandidate struct {
	provider        *resolvedProvider
	providerKeyName string
	providerKey     string
	weight          int
	enabled         bool
	tags            []string

	// unhealthyUntil stores UnixNano timestamp; 0 means healthy
	unhealthyUntil int64

	totalRequests uint64
	totalErrors   uint64
	lastStatus    int64
	lastUpdated   int64
	lastError     atomic.Value
	// Adaptive error rate smoothing parameters
	adaptiveLastUpdate int64
	adaptiveFailures   uint64 // float64 bits
	adaptiveSamples    uint64 // float64 bits
	adaptiveErrorRate  uint64 // float64 bits cache
}

// Route encapsulates the routing decision for a user and service type.
type Route struct {
	User             User
	Provider         Provider
	Service          Service
	UpstreamKeyName  string
	UpstreamKeyValue string
}

// NewManager constructs an empty manager.
func NewManager() *Manager {
	return &Manager{}
}

// LoadFromFile parses the YAML at path and, if valid, swaps it into the manager.
func (m *Manager) LoadFromFile(path string) error {
	bytes, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read config: %w", err)
	}

	cfg, err := parse(bytes)
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.data = cfg
	return nil
}

// Current returns a copy of the raw configuration for inspection.
func (m *Manager) Current() *Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.data == nil || m.data.raw == nil {
		return nil
	}
	out := *m.data.raw
	return &out
}

// Resolve determines the upstream route for the given user apiKey and service type.
func (m *Manager) Resolve(apiKey, serviceType string) (*Route, error) {
	if apiKey == "" {
		return nil, ErrAPIKeyRequired
	}
	if serviceType == "" {
		return nil, ErrServiceTypeRequired
	}

	m.mu.RLock()
	data := m.data
	m.mu.RUnlock()

	if data == nil {
		return nil, ErrConfigNotLoaded
	}

	user, ok := data.users[apiKey]
	if !ok {
		return nil, ErrUserNotFound
	}

	resolvedSvc, ok := user.services[serviceType]
	if !ok {
		return nil, fmt.Errorf("%w for user '%s'", ErrServiceNotFound, user.user.Name)
	}

	cand := selectCandidate(resolvedSvc)
	if cand == nil {
		return nil, ErrNoActiveUpstream
	}

	service, ok := cand.provider.services[serviceType]
	if !ok {
		return nil, fmt.Errorf("%w for provider '%s'", ErrServiceNotFound, cand.provider.provider.Name)
	}

	route := &Route{
		User:             user.user,
		Provider:         cand.provider.provider,
		Service:          service,
		UpstreamKeyName:  cand.providerKeyName,
		UpstreamKeyValue: cand.providerKey,
	}
	return route, nil
}

func parse(b []byte) (*resolvedConfig, error) {
	var raw Config
	if err := yaml.Unmarshal(b, &raw); err != nil {
		return nil, fmt.Errorf("parse config yaml: %w", err)
	}

	providers := make(map[string]*resolvedProvider, len(raw.Providers))

	for i, p := range raw.Providers {
		name := strings.TrimSpace(p.Name)
		if name == "" {
			return nil, fmt.Errorf("providers[%d]: name is required", i)
		}
		if _, exists := providers[name]; exists {
			return nil, fmt.Errorf("provider name '%s' duplicated", name)
		}

		if len(p.APIKeys) == 0 {
			return nil, fmt.Errorf("provider '%s': apiKeys must not be empty", name)
		}
		sanitizedKeys := make(map[string]string, len(p.APIKeys))
		for key, value := range p.APIKeys {
			trimmedKey := strings.TrimSpace(key)
			if trimmedKey == "" {
				return nil, fmt.Errorf("provider '%s': apiKeys contains empty key name", name)
			}
			if _, exists := sanitizedKeys[trimmedKey]; exists {
				return nil, fmt.Errorf("provider '%s': duplicate apiKey entry '%s'", name, trimmedKey)
			}
			trimmedValue := strings.TrimSpace(value)
			if trimmedValue == "" {
				return nil, fmt.Errorf("provider '%s': apiKey '%s' value must not be empty", name, trimmedKey)
			}
			sanitizedKeys[trimmedKey] = trimmedValue
		}

		services := make(map[string]Service, len(p.Services))
		sanitizedServices := make([]Service, 0, len(p.Services))
		for j, svc := range p.Services {
			svcType := strings.TrimSpace(svc.Type)
			if svcType == "" {
				return nil, fmt.Errorf("provider '%s' services[%d]: type is required", name, j)
			}
			if _, exists := services[svcType]; exists {
				return nil, fmt.Errorf("provider '%s': duplicate service type '%s'", name, svcType)
			}
			baseURL := strings.TrimSpace(svc.BaseURL)
			if baseURL == "" {
				return nil, fmt.Errorf("provider '%s' services[%d]: baseUrl is required", name, j)
			}
			sanitized := Service{
				Type:    svcType,
				BaseURL: baseURL,
			}

			auth := AuthConfig{
				Mode:   AuthModeHeader,
				Name:   "Authorization",
				Prefix: "Bearer ",
			}

			if svc.Auth != nil {
				auth = *svc.Auth
				auth.Mode = strings.TrimSpace(auth.Mode)
				if auth.Mode == "" {
					auth.Mode = AuthModeHeader
				}
				if auth.Mode != AuthModeHeader && auth.Mode != AuthModeQuery {
					return nil, fmt.Errorf("provider '%s' services[%d]: unsupported auth mode '%s'", name, j, svc.Auth.Mode)
				}
				auth.Name = strings.TrimSpace(auth.Name)
				if auth.Name == "" {
					if auth.Mode == AuthModeHeader {
						auth.Name = "Authorization"
					} else {
						return nil, fmt.Errorf("provider '%s' services[%d]: auth.name is required", name, j)
					}
				}
				if auth.Mode == AuthModeHeader && strings.TrimSpace(auth.Prefix) == "" {
					auth.Prefix = "Bearer "
				}
			}

			sanitized.Auth = &auth
			services[svcType] = sanitized
			sanitizedServices = append(sanitizedServices, sanitized)
		}

		resolved := &resolvedProvider{
			provider: Provider{
				Name:     name,
				APIKeys:  sanitizedKeys,
				Services: sanitizedServices,
			},
			services: services,
		}
		providers[name] = resolved
		raw.Providers[i] = resolved.provider
	}

	users := make(map[string]*resolvedUser, len(raw.Users))
	for i, u := range raw.Users {
		apiKey := strings.TrimSpace(u.APIKey)
		if apiKey == "" {
			return nil, fmt.Errorf("users[%d]: apiKey is required", i)
		}
		if _, exists := users[apiKey]; exists {
			return nil, fmt.Errorf("duplicate user apiKey '%s'", apiKey)
		}

		if len(u.Services) == 0 {
			return nil, fmt.Errorf("users[%d]: services mapping is required", i)
		}

		resolvedServices := make(map[string]*resolvedUserService, len(u.Services))
		sanitizedServices := make(map[string]UserServiceRoute, len(u.Services))
		for svcType, route := range u.Services {
			trimmedType := strings.TrimSpace(svcType)
			if trimmedType == "" {
				return nil, fmt.Errorf("users[%d]: service type key must not be empty", i)
			}
			if _, exists := resolvedServices[trimmedType]; exists {
				return nil, fmt.Errorf("users[%d]: duplicate service mapping for '%s'", i, trimmedType)
			}

			// Determine whether aggregated candidates provided
			hasAggregates := len(route.Candidates) > 0 || strings.TrimSpace(route.Strategy) != ""
			var candidates []*resolvedCandidate

			if hasAggregates {
				// Build candidates from route.Candidates
				sanitizedCandidates := make([]UserServiceCandidate, 0, len(route.Candidates))
				for idx, c := range route.Candidates {
					pName := strings.TrimSpace(c.ProviderName)
					if pName == "" {
						return nil, fmt.Errorf("users[%d] service '%s' candidates[%d]: providerName is required", i, trimmedType, idx)
					}
					prov, ok := providers[pName]
					if !ok {
						return nil, fmt.Errorf("users[%d] service '%s' candidates[%d]: provider '%s' not defined", i, trimmedType, idx, pName)
					}
					keyName := strings.TrimSpace(c.ProviderKeyName)
					if keyName == "" {
						return nil, fmt.Errorf("users[%d] service '%s' candidates[%d]: providerKeyName is required", i, trimmedType, idx)
					}
					keyVal, ok := prov.provider.APIKeys[keyName]
					if !ok {
						return nil, fmt.Errorf("users[%d] service '%s' candidates[%d]: provider key '%s' missing for provider '%s'", i, trimmedType, idx, keyName, pName)
					}
					if _, ok := prov.services[trimmedType]; !ok {
						return nil, fmt.Errorf("users[%d] service '%s' candidates[%d]: provider '%s' does not expose this service", i, trimmedType, idx, pName)
					}
					w := c.Weight
					if w <= 0 {
						w = 1
					}
					enabled := true
					if c.Enabled != nil {
						enabled = *c.Enabled
					}
					tags := make([]string, 0, len(c.Tags))
					for _, tag := range c.Tags {
						trimmedTag := strings.TrimSpace(tag)
						if trimmedTag != "" {
							tags = append(tags, trimmedTag)
						}
					}
					candidates = append(candidates, &resolvedCandidate{
						provider:        prov,
						providerKeyName: keyName,
						providerKey:     keyVal,
						weight:          w,
						enabled:         enabled,
						tags:            tags,
					})

					enabledCopy := enabled
					sanitizedCandidates = append(sanitizedCandidates, UserServiceCandidate{
						ProviderName:    pName,
						ProviderKeyName: keyName,
						Weight:          w,
						Enabled:         &enabledCopy,
						Tags:            tags,
					})
				}
				if len(candidates) == 0 {
					return nil, fmt.Errorf("users[%d] service '%s': candidates must not be empty when strategy provided", i, trimmedType)
				}

				strategy := strings.TrimSpace(route.Strategy)
				if strategy == "" {
					strategy = strategyRoundRobin
				}
				strategy = strings.ToLower(strategy)
				switch strategy {
				case strategyRoundRobin, strategyWeightedRR, strategyAdaptiveRR, strategyStickyHealthy:
				default:
					return nil, fmt.Errorf("users[%d] service '%s': unsupported strategy '%s'", i, trimmedType, strategy)
				}

				resolvedServices[trimmedType] = &resolvedUserService{
					strategy:    strategy,
					candidates:  candidates,
					stickyIndex: -1,
				}

				sanitizedServices[trimmedType] = UserServiceRoute{
					Strategy:   strategy,
					Candidates: sanitizedCandidates,
				}
			} else {
				// Legacy single route → 1-candidate RR
				providerName := strings.TrimSpace(route.ProviderName)
				if providerName == "" {
					return nil, fmt.Errorf("users[%d] service '%s': providerName is required", i, trimmedType)
				}
				provider, ok := providers[providerName]
				if !ok {
					return nil, fmt.Errorf("users[%d] service '%s': provider '%s' not defined", i, trimmedType, providerName)
				}
				providerKeyName := strings.TrimSpace(route.ProviderKeyName)
				if providerKeyName == "" {
					return nil, fmt.Errorf("users[%d] service '%s': providerKeyName is required", i, trimmedType)
				}
				providerKey, ok := provider.provider.APIKeys[providerKeyName]
				if !ok {
					return nil, fmt.Errorf("users[%d] service '%s': provider key '%s' missing for provider '%s'", i, trimmedType, providerKeyName, providerName)
				}
				if _, ok := provider.services[trimmedType]; !ok {
					return nil, fmt.Errorf("users[%d] service '%s': provider '%s' does not expose this service", i, trimmedType, providerName)
				}

				candidates = []*resolvedCandidate{
					{
						provider:        provider,
						providerKeyName: providerKeyName,
						providerKey:     providerKey,
						weight:          1,
						enabled:         true,
					},
				}

				resolvedServices[trimmedType] = &resolvedUserService{
					strategy:    strategyRoundRobin,
					candidates:  candidates,
					stickyIndex: -1,
				}

				sanitizedServices[trimmedType] = UserServiceRoute{
					ProviderName:    providerName,
					ProviderKeyName: providerKeyName,
				}
			}
		}

		sanitizedUser := User{
			Name:     strings.TrimSpace(u.Name),
			APIKey:   apiKey,
			Services: sanitizedServices,
		}

		users[apiKey] = &resolvedUser{
			user:     sanitizedUser,
			services: resolvedServices,
		}
		raw.Users[i] = sanitizedUser
	}

	return &resolvedConfig{
		raw:       &raw,
		providers: providers,
		users:     users,
	}, nil
}

// selectCandidate applies the configured strategy to pick a healthy, enabled candidate.
func selectCandidate(svc *resolvedUserService) *resolvedCandidate {
	if svc == nil || len(svc.candidates) == 0 {
		return nil
	}
	// Build eligible list snapshot
	now := time.Now().UnixNano()
	eligible := make([]*resolvedCandidate, 0, len(svc.candidates))
	origIdx := make([]int, 0, len(svc.candidates))
	weights := make([]float64, 0, len(svc.candidates))
	totalWeight := 0.0
	for i, c := range svc.candidates {
		if !c.enabled {
			continue
		}
		unhealthyUntil := atomic.LoadInt64(&c.unhealthyUntil)
		if unhealthyUntil > 0 && now < unhealthyUntil {
			continue
		}
		eligible = append(eligible, c)
		origIdx = append(origIdx, i)
		w := float64(c.weight)
		if w <= 0 {
			w = 1
		}
		if svc.strategy == strategyAdaptiveRR {
			errRate := atomicLoadFloat64(&c.adaptiveErrorRate)
			if errRate < 0 {
				errRate = 0
			}
			if errRate > 1 {
				errRate = 1
			}
			quality := 1 - errRate
			if quality < adaptiveQualityFloor {
				quality = adaptiveQualityFloor
			}
			w = w * quality
		}
		weights = append(weights, w)
		totalWeight += w
	}
	if len(eligible) == 0 {
		return nil
	}
	if svc.strategy == strategyStickyHealthy {
		sticky := int(atomic.LoadInt32(&svc.stickyIndex))
		if sticky >= 0 {
			for i, idx := range origIdx {
				if idx == sticky {
					return eligible[i]
				}
			}
		}
		// select first eligible in original order
		chosen := eligible[0]
		atomic.StoreInt32(&svc.stickyIndex, int32(origIdx[0]))
		return chosen
	}
	if (svc.strategy == strategyWeightedRR || svc.strategy == strategyAdaptiveRR) && totalWeight > 0 {
		idx := atomic.AddUint64(&svc.rrCounter, 1) - 1
		pos := math.Mod(float64(idx), totalWeight)
		acc := 0.0
		for i, c := range eligible {
			acc += weights[i]
			if pos < acc {
				if svc.strategy == strategyStickyHealthy {
					atomic.StoreInt32(&svc.stickyIndex, int32(origIdx[i]))
				}
				return c
			}
		}
		// Fallback (should not happen)
		return eligible[len(eligible)-1]
	}
	// Default round_robin
	idx := atomic.AddUint64(&svc.rrCounter, 1) - 1
	return eligible[int(idx%uint64(len(eligible)))]
}

func updateAdaptiveMetrics(c *resolvedCandidate, now time.Time, failure bool) {
	if adaptiveTauSeconds <= 0 {
		return
	}
	last := atomic.LoadInt64(&c.adaptiveLastUpdate)
	var failures float64
	var samples float64
	if last > 0 {
		elapsed := float64(now.UnixNano()-last) / 1e9
		if elapsed < 0 {
			elapsed = 0
		}
		decay := math.Exp(-elapsed / adaptiveTauSeconds)
		failures = atomicLoadFloat64(&c.adaptiveFailures) * decay
		samples = atomicLoadFloat64(&c.adaptiveSamples) * decay
	} else {
		failures = 0
		samples = 0
	}
	if failure {
		failures += 1
	}
	samples += 1
	atomicStoreFloat64(&c.adaptiveFailures, failures)
	atomicStoreFloat64(&c.adaptiveSamples, samples)
	atomic.StoreInt64(&c.adaptiveLastUpdate, now.UnixNano())
	errRate := 0.0
	if samples > 0 {
		errRate = failures / samples
	}
	if errRate < 0 {
		errRate = 0
	} else if errRate > 1 {
		errRate = 1
	}
	atomicStoreFloat64(&c.adaptiveErrorRate, errRate)
}

// ReportResult updates runtime health/telemetry for a candidate.
// Non-2xx/3xx considered failures for health; 502/503 trigger temporary quarantine.
func (m *Manager) ReportResult(apiKey, serviceType, providerName, providerKeyName string, status int, err error) {
	m.mu.RLock()
	data := m.data
	m.mu.RUnlock()
	if data == nil {
		return
	}
	svcUser, ok := data.users[apiKey]
	if !ok {
		return
	}
	svc, ok := svcUser.services[serviceType]
	if !ok {
		return
	}
	now := time.Now()
	for _, c := range svc.candidates {
		if c.provider != nil && c.provider.provider.Name == providerName && c.providerKeyName == providerKeyName {
			atomic.AddUint64(&c.totalRequests, 1)
			atomic.StoreInt64(&c.lastStatus, int64(status))
			atomic.StoreInt64(&c.lastUpdated, now.UnixNano())

			failure := err != nil || status == 0 || status >= 500
			if failure {
				atomic.AddUint64(&c.totalErrors, 1)
			}

			updateAdaptiveMetrics(c, now, failure)

			if err != nil {
				c.lastError.Store(err.Error())
			} else if status >= 500 {
				c.lastError.Store(fmt.Sprintf("upstream status %d", status))
			} else {
				c.lastError.Store("")
			}

			if failure {
				backoff := 30 * time.Second
				if status == 502 || status == 503 {
					backoff = 60 * time.Second
				}
				until := now.Add(backoff).UnixNano()
				atomic.StoreInt64(&c.unhealthyUntil, until)
			} else if status >= 200 && status < 500 {
				// clear unhealthy flag on success or client error
				atomic.StoreInt64(&c.unhealthyUntil, 0)
			}

			metrics.ObserveCandidateResult(serviceType, providerName, providerKeyName, status, err)
			return
		}
	}
}

// CandidateRuntimeStatus captures runtime statistics for a single upstream candidate.
type CandidateRuntimeStatus struct {
	ProviderName    string     `json:"provider_name"`
	ProviderKeyName string     `json:"provider_key_name"`
	Weight          int        `json:"weight"`
	Enabled         bool       `json:"enabled"`
	Healthy         bool       `json:"healthy"`
	UnhealthyUntil  *time.Time `json:"unhealthy_until,omitempty"`
	TotalRequests   uint64     `json:"total_requests"`
	TotalErrors     uint64     `json:"total_errors"`
	ErrorRate       float64    `json:"error_rate"`
	SmoothedError   float64    `json:"smoothed_error_rate,omitempty"`
	EffectiveWeight float64    `json:"effective_weight,omitempty"`
	LastStatus      int        `json:"last_status"`
	LastError       string     `json:"last_error,omitempty"`
	LastUpdated     time.Time  `json:"last_updated,omitempty"`
	Tags            []string   `json:"tags,omitempty"`
}

// RuntimeStatus returns runtime statistics for a user/service route.
func (m *Manager) RuntimeStatus(apiKey, serviceType string) ([]CandidateRuntimeStatus, error) {
	if apiKey == "" {
		return nil, ErrAPIKeyRequired
	}
	if serviceType == "" {
		return nil, ErrServiceTypeRequired
	}

	m.mu.RLock()
	data := m.data
	m.mu.RUnlock()

	if data == nil {
		return nil, ErrConfigNotLoaded
	}

	user, ok := data.users[apiKey]
	if !ok {
		return nil, ErrUserNotFound
	}

	svc, ok := user.services[serviceType]
	if !ok {
		return nil, fmt.Errorf("%w for user '%s'", ErrServiceNotFound, user.user.Name)
	}

	now := time.Now()
	statuses := make([]CandidateRuntimeStatus, 0, len(svc.candidates))
	for _, c := range svc.candidates {
		total := atomic.LoadUint64(&c.totalRequests)
		errors := atomic.LoadUint64(&c.totalErrors)
		lastStatus := int(atomic.LoadInt64(&c.lastStatus))
		lastUpdatedUnix := atomic.LoadInt64(&c.lastUpdated)
		unhealthyUntilUnix := atomic.LoadInt64(&c.unhealthyUntil)

		healthy := c.enabled
		var unhealthyUntil *time.Time
		if unhealthyUntilUnix > 0 {
			t := time.Unix(0, unhealthyUntilUnix)
			if now.Before(t) {
				healthy = false
			}
			unhealthyUntil = &t
		}

		var lastUpdated time.Time
		if lastUpdatedUnix > 0 {
			lastUpdated = time.Unix(0, lastUpdatedUnix)
		}

		var lastError string
		if v := c.lastError.Load(); v != nil {
			if s, ok := v.(string); ok {
				lastError = s
			}
		}

		errorRate := 0.0
		if total > 0 {
			errorRate = float64(errors) / float64(total)
		}
		smoothed := atomicLoadFloat64(&c.adaptiveErrorRate)
		if smoothed < 0 {
			smoothed = 0
		} else if smoothed > 1 {
			smoothed = 1
		}
		effectiveWeight := float64(c.weight)
		if effectiveWeight <= 0 {
			effectiveWeight = 1
		}
		if svc.strategy == strategyAdaptiveRR {
			quality := 1 - smoothed
			if quality < adaptiveQualityFloor {
				quality = adaptiveQualityFloor
			}
			effectiveWeight *= quality
		}

		status := CandidateRuntimeStatus{
			ProviderName:    c.provider.provider.Name,
			ProviderKeyName: c.providerKeyName,
			Weight:          c.weight,
			Enabled:         c.enabled,
			Healthy:         healthy,
			UnhealthyUntil:  unhealthyUntil,
			TotalRequests:   total,
			TotalErrors:     errors,
			ErrorRate:       errorRate,
			SmoothedError:   smoothed,
			EffectiveWeight: effectiveWeight,
			LastStatus:      lastStatus,
			LastError:       lastError,
			LastUpdated:     lastUpdated,
			Tags:            append([]string(nil), c.tags...),
		}

		statuses = append(statuses, status)
	}

	return statuses, nil
}

// ListServiceTypes returns all unique service types known to the manager.
func (m *Manager) ListServiceTypes() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.data == nil {
		return nil
	}
	seen := make(map[string]struct{})
	for _, provider := range m.data.providers {
		for svcType := range provider.services {
			seen[svcType] = struct{}{}
		}
	}
	list := make([]string, 0, len(seen))
	for svcType := range seen {
		list = append(list, svcType)
	}
	sort.Strings(list)
	return list
}
