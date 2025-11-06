package config

// AuthMode enumerates supported upstream authentication wiring strategies.
const (
	AuthModeHeader = "header"
	AuthModeQuery  = "query"
)

// Config represents the full piapi configuration surface.
type Config struct {
	Providers []Provider `yaml:"providers" json:"providers"`
	Users     []User     `yaml:"users" json:"users"`
}

// Provider describes an upstream vendor and its available services and keys.
type Provider struct {
	Name     string            `yaml:"name" json:"name"`
	APIKeys  map[string]string `yaml:"apiKeys" json:"api_keys"`
	Services []Service         `yaml:"services" json:"services"`
}

// Service captures routing metadata for a particular upstream capability.
type Service struct {
	Type    string      `yaml:"type" json:"type"`
	BaseURL string      `yaml:"baseUrl" json:"base_url"`
	Auth    *AuthConfig `yaml:"auth" json:"auth,omitempty"`
}

// AuthConfig parameterizes how to inject upstream credentials per service.
type AuthConfig struct {
	Mode   string `yaml:"mode" json:"mode"`
	Name   string `yaml:"name" json:"name"`
	Prefix string `yaml:"prefix" json:"prefix,omitempty"`
}

// User defines the mapping between a piapi API key and an upstream route.
type User struct {
	Name     string                      `yaml:"name" json:"name"`
	APIKey   string                      `yaml:"apiKey" json:"api_key"`
	Services map[string]UserServiceRoute `yaml:"services" json:"services"`
}

// UserServiceRoute defines the upstream selection for a specific service type.
type UserServiceRoute struct {
	ProviderName    string `yaml:"providerName" json:"provider_name"`
	ProviderKeyName string `yaml:"providerKeyName" json:"provider_key_name"`

	// Aggregated routing (optional; when provided, overrides ProviderName/ProviderKeyName)
	// Strategy supports：
	//   - round_robin（默认轮询）
	//   - weighted_rr（静态加权轮询）
	//   - adaptive_rr（基于运行时质量的自动加权）
	//   - sticky_healthy（粘住最近健康候选，失败后切换）
	Strategy   string                 `yaml:"strategy" json:"strategy,omitempty"`
	Candidates []UserServiceCandidate `yaml:"candidates" json:"candidates,omitempty"`
}

// UserServiceCandidate describes one upstream candidate in an aggregated route.
type UserServiceCandidate struct {
	ProviderName    string   `yaml:"providerName" json:"provider_name"`
	ProviderKeyName string   `yaml:"providerKeyName" json:"provider_key_name"`
	Weight          int      `yaml:"weight" json:"weight,omitempty"`
	Enabled         *bool    `yaml:"enabled" json:"enabled,omitempty"`
	Tags            []string `yaml:"tags" json:"tags,omitempty"`
}
