package server

import (
	"context"
	"net/http"

	"github.com/google/uuid"
)

// contextKey prevents collisions for context values stored in request context.
type contextKey string

const requestIDKey contextKey = "request-id"

// RequestIDMiddleware ensures every request has a unique identifier available via context and response header.
func RequestIDMiddleware(next http.Handler) http.Handler {
	if next == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := RequestIDFromContext(r.Context())
		if reqID == "" {
			reqID = uuid.NewString()
			r = r.WithContext(ContextWithRequestID(r.Context(), reqID))
		}
		w.Header().Set("X-Request-ID", reqID)
		next.ServeHTTP(w, r)
	})
}

// ContextWithRequestID injects the request id into the provided context.
func ContextWithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

// RequestIDFromContext retrieves the request id from context, if present.
func RequestIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v := ctx.Value(requestIDKey); v != nil {
		if id, ok := v.(string); ok {
			return id
		}
	}
	return ""
}

// loggingResponseWriter captures status codes for logging purposes.
type loggingResponseWriter struct {
	http.ResponseWriter
	status int
}

func newLoggingResponseWriter(w http.ResponseWriter) *loggingResponseWriter {
	return &loggingResponseWriter{ResponseWriter: w}
}

func (lrw *loggingResponseWriter) WriteHeader(code int) {
	lrw.status = code
	lrw.ResponseWriter.WriteHeader(code)
}

func (lrw *loggingResponseWriter) Status() int {
	if lrw.status == 0 {
		return http.StatusOK
	}
	return lrw.status
}
