package config

// AuthMode enumerates supported upstream authentication wiring strategies.
const (
	AuthModeHeader = "header"
	AuthModeQuery  = "query"
)

// Config represents the full piapi configuration surface.
type Config struct {
	Providers []Provider `yaml:"providers"`
	Users     []User     `yaml:"users"`
}

// Provider describes an upstream vendor and its available services and keys.
type Provider struct {
	Name     string            `yaml:"name"`
	APIKeys  map[string]string `yaml:"apiKeys"`
	Services []Service         `yaml:"services"`
}

// Service captures routing metadata for a particular upstream capability.
type Service struct {
	Type    string      `yaml:"type"`
	BaseURL string      `yaml:"baseUrl"`
	Auth    *AuthConfig `yaml:"auth"`
}

// AuthConfig parameterizes how to inject upstream credentials per service.
type AuthConfig struct {
	Mode   string `yaml:"mode"`
	Name   string `yaml:"name"`
	Prefix string `yaml:"prefix"`
}

// User defines the mapping between a piapi API key and an upstream route.
type User struct {
	Name            string `yaml:"name"`
	APIKey          string `yaml:"apiKey"`
	ProviderName    string `yaml:"providerName"`
	ProviderKeyName string `yaml:"providerKeyName"`
}
