package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/kingshot-hive/backend/internal/api"
	"github.com/kingshot-hive/backend/internal/store"
)

//go:embed frontend
var frontendFS embed.FS

func main() {
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	requireCORS := strings.EqualFold(os.Getenv("REQUIRE_CORS_ORIGIN"), "true")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/data/kingshot.db"
	}

	corsOrigin := os.Getenv("CORS_ORIGIN")
	if appEnv == "production" {
		requireCORS = true
	}
	if requireCORS && strings.TrimSpace(corsOrigin) == "" {
		log.Fatal("CORS_ORIGIN is required when REQUIRE_CORS_ORIGIN=true or APP_ENV=production")
	}
	if strings.TrimSpace(corsOrigin) != "" {
		u, err := url.ParseRequestURI(corsOrigin)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			log.Fatal("CORS_ORIGIN must be a valid http/https origin")
		}
	}

	s, err := store.New(dbPath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer s.Close()

	apiRouter := api.NewRouter(s, corsOrigin)

	mux := http.NewServeMux()

	// Mount API routes
	mux.Handle("/api/", apiRouter)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Serve embedded frontend for all other paths
	sub, err := fs.Sub(frontendFS, "frontend")
	if err != nil {
		log.Fatalf("failed to create sub filesystem: %v", err)
	}
	fileServer := http.FileServer(http.FS(sub))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file; if it doesn't exist, serve index.html (SPA fallback)
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}
		if _, err := fs.Stat(sub, path[1:]); err != nil {
			// Serve index.html for SPA routing
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})

	log.Printf("Starting server on :%s (DB: %s)", port, dbPath)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
