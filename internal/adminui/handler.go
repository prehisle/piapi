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
			// File not found, serve admin.html for SPA routing
			f, err = h.staticFS.Open("/admin.html")
			if err != nil {
				http.Error(w, "Not Found", http.StatusNotFound)
				return
			}
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
		}

		// Serve the file
		w.Header().Set("Content-Type", getContentType(path))
		w.WriteHeader(http.StatusOK)
		io.Copy(w, f)
	})).ServeHTTP(w, r)
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
	case len(path) > 4 && path[len(path)-4:] == ".svg":
		return "image/svg+xml"
	default:
		return "application/octet-stream"
	}
}
