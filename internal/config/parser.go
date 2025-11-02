package config

// ParseYAML validates the provided configuration payload and returns the sanitized Config.
func ParseYAML(b []byte) (*Config, error) {
	resolved, err := parse(b)
	if err != nil {
		return nil, err
	}
	if resolved.raw == nil {
		return nil, ErrConfigNotLoaded
	}
	out := *resolved.raw
	return &out, nil
}
