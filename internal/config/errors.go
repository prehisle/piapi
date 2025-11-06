package config

import "errors"

var (
    ErrConfigNotLoaded     = errors.New("config not loaded")
    ErrAPIKeyRequired      = errors.New("api key required")
    ErrServiceTypeRequired = errors.New("service type required")
    ErrUserNotFound        = errors.New("user api key not found")
    ErrServiceNotFound     = errors.New("service type not found")
    ErrNoActiveUpstream    = errors.New("no active upstream candidate")
)
