package config

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

// Manager stores the parsed configuration and provides concurrent-safe lookups.
type Manager struct {
	mu   sync.RWMutex
	data *resolvedConfig
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
	user            User
	provider        *resolvedProvider
	providerKeyName string
	providerKey     string
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

	service, ok := user.provider.services[serviceType]
	if !ok {
		return nil, fmt.Errorf("%w for provider '%s'", ErrServiceNotFound, user.provider.provider.Name)
	}

	route := &Route{
		User:             user.user,
		Provider:         user.provider.provider,
		Service:          service,
		UpstreamKeyName:  user.providerKeyName,
		UpstreamKeyValue: user.providerKey,
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
			if svc.Auth != nil {
				auth := *svc.Auth
				mode := strings.TrimSpace(auth.Mode)
				if mode == "" {
					mode = AuthModeHeader
				}
				if mode != AuthModeHeader && mode != AuthModeQuery {
					return nil, fmt.Errorf("provider '%s' services[%d]: unsupported auth mode '%s'", name, j, svc.Auth.Mode)
				}
				auth.Mode = mode
				auth.Name = strings.TrimSpace(auth.Name)
				if auth.Name == "" {
					return nil, fmt.Errorf("provider '%s' services[%d]: auth.name is required", name, j)
				}
				if mode == AuthModeHeader && auth.Prefix == "" {
					auth.Prefix = "Bearer "
				}
				sanitized.Auth = &auth
			}
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
		providerName := strings.TrimSpace(u.ProviderName)
		if providerName == "" {
			return nil, fmt.Errorf("users[%d]: providerName is required", i)
		}
		provider, ok := providers[providerName]
		if !ok {
			return nil, fmt.Errorf("users[%d]: provider '%s' not defined", i, providerName)
		}
		providerKeyName := strings.TrimSpace(u.ProviderKeyName)
		if providerKeyName == "" {
			return nil, fmt.Errorf("users[%d]: providerKeyName is required", i)
		}
		providerKey, ok := provider.provider.APIKeys[providerKeyName]
		if !ok {
			return nil, fmt.Errorf("users[%d]: provider key '%s' missing for provider '%s'", i, providerKeyName, providerName)
		}

		resolved := &resolvedUser{
			user: User{
				Name:            strings.TrimSpace(u.Name),
				APIKey:          apiKey,
				ProviderName:    providerName,
				ProviderKeyName: providerKeyName,
			},
			provider:        provider,
			providerKeyName: providerKeyName,
			providerKey:     providerKey,
		}
		users[apiKey] = resolved
		raw.Users[i] = resolved.user
	}

	return &resolvedConfig{
		raw:       &raw,
		providers: providers,
		users:     users,
	}, nil
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
