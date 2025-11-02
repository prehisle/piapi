package server

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"piapi/internal/config"
	"piapi/internal/metrics"
)

// Gateway handles incoming piapi requests and proxies them to upstream providers.
type Gateway struct {
	Config    *config.Manager
	BasePath  string
	Transport http.RoundTripper
	Logger    *zap.Logger
}

// ServeHTTP implements http.Handler.
func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	logger := g.getLogger()
	lrw := newLoggingResponseWriter(w)
	r, requestID := g.ensureRequestID(r, lrw)

	start := time.Now()
	var (
		serviceType     string
		rest            string
		userName        string
		providerName    string
		providerKeyName string
		errMessage      string
	)

	defer func() {
		status := lrw.Status()
		fields := []zap.Field{
			zap.String("request_id", requestID),
			zap.String("method", r.Method),
			zap.String("path", r.URL.Path),
			zap.String("user", userName),
			zap.String("service_type", serviceType),
			zap.String("upstream_provider", providerName),
			zap.String("upstream_key", providerKeyName),
			zap.Int("status", status),
			zap.Duration("latency", time.Since(start)),
		}
		if errMessage != "" {
			fields = append(fields, zap.String("error", errMessage))
		}
		metrics.ObserveRequest(serviceType, status, time.Since(start))
		switch {
		case status >= 500:
			logger.Error("request completed", fields...)
		case status >= 400:
			logger.Warn("request completed", fields...)
		default:
			logger.Info("request completed", fields...)
		}
	}()

	basePath := g.basePath()
	if !strings.HasPrefix(r.URL.Path, basePath) {
		errMessage = http.StatusText(http.StatusNotFound)
		http.NotFound(lrw, r)
		return
	}

	var err error
	serviceType, rest, err = extractServiceType(r.URL.Path, basePath)
	if err != nil {
		errMessage = err.Error()
		http.Error(lrw, errMessage, http.StatusNotFound)
		return
	}

	apiKey, err := extractAPIKey(r.Header.Get("Authorization"))
	if err != nil {
		errMessage = err.Error()
		http.Error(lrw, errMessage, http.StatusUnauthorized)
		return
	}

	if g.Config == nil {
		errMessage = config.ErrConfigNotLoaded.Error()
		http.Error(lrw, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	route, err := g.Config.Resolve(apiKey, serviceType)
	if err != nil {
		errMessage = err.Error()
		switch {
		case errors.Is(err, config.ErrUserNotFound):
			http.Error(lrw, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
		case errors.Is(err, config.ErrServiceNotFound):
			http.Error(lrw, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		case errors.Is(err, config.ErrAPIKeyRequired), errors.Is(err, config.ErrServiceTypeRequired):
			http.Error(lrw, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		default:
			http.Error(lrw, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		}
		return
	}

	userName = route.User.Name
	providerName = route.Provider.Name
	providerKeyName = route.UpstreamKeyName

	target, err := url.Parse(route.Service.BaseURL)
	if err != nil {
		errMessage = fmt.Sprintf("invalid base url: %v", err)
		http.Error(lrw, "invalid upstream configuration", http.StatusInternalServerError)
		return
	}

	if target.Scheme == "" || target.Host == "" {
		errMessage = "invalid upstream configuration: missing scheme or host"
		http.Error(lrw, "invalid upstream configuration", http.StatusInternalServerError)
		return
	}

	reqLogger := logger.With(
		zap.String("request_id", requestID),
		zap.String("user", userName),
		zap.String("service_type", serviceType),
		zap.String("upstream_provider", providerName),
	)

	proxy := g.buildProxy(target, route, rest, r.URL.RawQuery, reqLogger, &errMessage)
	proxy.ServeHTTP(lrw, r)
}

func (g *Gateway) basePath() string {
	if g.BasePath == "" {
		return "/piapi/"
	}
	if strings.HasSuffix(g.BasePath, "/") {
		return g.BasePath
	}
	return g.BasePath + "/"
}

func extractServiceType(path, base string) (serviceType, rest string, err error) {
	trimmed := strings.TrimPrefix(path, base)
	if trimmed == path {
		return "", "", fmt.Errorf("path not handled")
	}
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) == 0 || parts[0] == "" {
		return "", "", fmt.Errorf("service type missing")
	}
	serviceType = parts[0]
	if len(parts) == 2 {
		rest = parts[1]
	}
	return serviceType, rest, nil
}

func extractAPIKey(header string) (string, error) {
	if header == "" {
		return "", fmt.Errorf("missing Authorization header")
	}
	if len(header) >= 7 && strings.EqualFold(header[:7], "Bearer ") {
		token := strings.TrimSpace(header[7:])
		if token == "" {
			return "", fmt.Errorf("empty bearer token")
		}
		return token, nil
	}
	return "", fmt.Errorf("unsupported authorization scheme")
}

func (g *Gateway) buildProxy(target *url.URL, route *config.Route, rest string, originalRawQuery string, logger *zap.Logger, errMsg *string) *httputil.ReverseProxy {
	director := func(req *http.Request) {
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		req.Host = target.Host

		req.Header.Del("Authorization")

		path := joinPaths(target.Path, rest)
		req.URL.Path = path
		req.URL.RawPath = path

		queryValues := composeQuery(target.RawQuery, originalRawQuery)
		auth := route.Service.Auth
		if auth != nil && auth.Mode == config.AuthModeQuery {
			queryValues.Set(auth.Name, route.UpstreamKeyValue)
		}
		req.URL.RawQuery = queryValues.Encode()

		if auth != nil && auth.Mode == config.AuthModeHeader {
			value := route.UpstreamKeyValue
			if auth.Prefix != "" {
				value = auth.Prefix + value
			}
			req.Header.Set(auth.Name, value)
		} else if auth == nil {
			req.Header.Set("Authorization", "Bearer "+route.UpstreamKeyValue)
		}
	}

	proxy := &httputil.ReverseProxy{Director: director}
	if g.Transport != nil {
		proxy.Transport = g.Transport
	}
	proxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, err error) {
		if errMsg != nil {
			*errMsg = fmt.Sprintf("proxy error: %v", err)
		}
		logger.Warn("upstream proxy error", zap.Error(err))
		http.Error(rw, "upstream request failed", http.StatusBadGateway)
	}
	return proxy
}

func (g *Gateway) getLogger() *zap.Logger {
	if g.Logger != nil {
		return g.Logger
	}
	return zap.NewNop()
}

func (g *Gateway) ensureRequestID(r *http.Request, w http.ResponseWriter) (*http.Request, string) {
	reqID := RequestIDFromContext(r.Context())
	if reqID == "" {
		reqID = uuid.NewString()
		r = r.WithContext(ContextWithRequestID(r.Context(), reqID))
	}
	if w != nil {
		w.Header().Set("X-Request-ID", reqID)
	}
	return r, reqID
}

func joinPaths(base, rest string) string {
	if rest == "" {
		if base == "" {
			return "/"
		}
		return base
	}
	if base == "" || base == "/" {
		return ensureLeadingSlash(rest)
	}
	base = strings.TrimSuffix(base, "/")
	return base + "/" + rest
}

func ensureLeadingSlash(path string) string {
	if strings.HasPrefix(path, "/") {
		return path
	}
	return "/" + path
}

func composeQuery(baseRaw, reqRaw string) url.Values {
	values := url.Values{}
	if baseRaw != "" {
		if baseValues, err := url.ParseQuery(baseRaw); err == nil {
			for key, vs := range baseValues {
				for _, v := range vs {
					values.Add(key, v)
				}
			}
		}
	}
	if reqRaw != "" {
		if reqValues, err := url.ParseQuery(reqRaw); err == nil {
			for key, vs := range reqValues {
				for _, v := range vs {
					values.Add(key, v)
				}
			}
		}
	}
	return values
}
