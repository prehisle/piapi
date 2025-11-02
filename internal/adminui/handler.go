package adminui

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
)

//go:embed all:dist
var staticFiles embed.FS

// NewHandler creates a new admin UI handler
func NewHandler() (http.Handler, error) {
	// Strip the "dist" prefix from embedded filesystem
	sub, err := fs.Sub(staticFiles, "dist")
	if err != nil {
		return nil, err
	}

	return &spaHandler{
		staticFS: http.FS(sub),
	}, nil
}

// spaHandler handles SPA routing by serving admin.html for unknown routes
type spaHandler struct {
	staticFS http.FileSystem
}

func (h *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Strip /admin prefix and serve from filesystem
	http.StripPrefix("/admin", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "" || path == "/" {
			path = "/admin.html"
		}

		// Try to open the file
		f, err := h.staticFS.Open(path)
		if err != nil {
			// If it's a static asset (starts with /_next or is a known static file), return 404
			if isStaticAsset(path) {
				http.Error(w, "Not Found", http.StatusNotFound)
				return
			}
			// Otherwise, serve admin.html for SPA routing (client-side routes)
			f, err = h.staticFS.Open("/admin.html")
			if err != nil {
				http.Error(w, "Not Found", http.StatusNotFound)
				return
			}
			path = "/admin.html" // Update path for correct content type
		}
		defer f.Close()

		// Check if it's a directory
		stat, err := f.Stat()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if stat.IsDir() {
			// Serve admin.html for directories
			f.Close()
			f, err = h.staticFS.Open("/admin.html")
			if err != nil {
				http.Error(w, "Not Found", http.StatusNotFound)
				return
			}
			defer f.Close()
			stat, _ = f.Stat()
			path = "/admin.html"
		}

		// Serve the file
		w.Header().Set("Content-Type", getContentType(path))
		w.WriteHeader(http.StatusOK)
		io.Copy(w, f)
	})).ServeHTTP(w, r)
}

func isStaticAsset(path string) bool {
	// Check if path starts with known static asset prefixes
	if len(path) >= 6 && path[:6] == "/_next" {
		return true
	}
	// Check for other static files
	staticPrefixes := []string{"/placeholder", "/.next", "/__next"}
	for _, prefix := range staticPrefixes {
		if len(path) >= len(prefix) && path[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}

func getContentType(path string) string {
	switch {
	case len(path) > 5 && path[len(path)-5:] == ".html":
		return "text/html; charset=utf-8"
	case len(path) > 3 && path[len(path)-3:] == ".js":
		return "application/javascript"
	case len(path) > 4 && path[len(path)-4:] == ".css":
		return "text/css"
	case len(path) > 4 && path[len(path)-4:] == ".png":
		return "image/png"
	case len(path) > 4 && path[len(path)-4:] == ".jpg":
		return "image/jpeg"
	case len(path) > 5 && path[len(path)-5:] == ".jpeg":
		return "image/jpeg"
	case len(path) > 4 && path[len(path)-4:] == ".svg":
		return "image/svg+xml"
	case len(path) > 5 && path[len(path)-5:] == ".woff":
		return "font/woff"
	case len(path) > 6 && path[len(path)-6:] == ".woff2":
		return "font/woff2"
	default:
		return "application/octet-stream"
	}
}
