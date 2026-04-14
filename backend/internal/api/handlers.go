package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/kingshot-hive/backend/internal/models"
	"github.com/kingshot-hive/backend/internal/store"
)

const maxBodySize = 1 << 20 // 1 MB

// NewRouter builds the chi router with all API routes.
func NewRouter(s store.Store, corsOrigin string) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware(corsOrigin))

	r.Route("/api/layouts", func(r chi.Router) {
		r.Get("/", listLayouts(s))
		r.Post("/", writeRateLimit(createLayout(s)))
		r.Get("/{id}", getLayout(s))
		r.Put("/{id}", writeRateLimit(updateLayout(s)))
		r.Delete("/{id}", writeRateLimit(deleteLayout(s)))
	})

	return r
}

// --- Handlers ---

func listLayouts(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		items, err := s.List()
		if err != nil {
			serverError(w, err)
			return
		}
		if items == nil {
			items = []models.ListItem{}
		}
		jsonResponse(w, http.StatusOK, items)
	}
}

func getLayout(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		layout, err := s.Get(id)
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		jsonResponse(w, http.StatusOK, layout)
	}
}

func createLayout(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)

		var req models.CreateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Data) == "" {
			http.Error(w, "name and data are required", http.StatusBadRequest)
			return
		}

		layout, err := s.Create(req)
		if err != nil {
			serverError(w, err)
			return
		}
		jsonResponse(w, http.StatusCreated, layout)
	}
}

func updateLayout(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
		id := chi.URLParam(r, "id")

		var req models.UpdateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Data) == "" {
			http.Error(w, "data is required", http.StatusBadRequest)
			return
		}

		err := s.Update(id, req)
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrForbidden) || errors.Is(err, store.ErrPasswordNeeded) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func deleteLayout(s store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
		id := chi.URLParam(r, "id")

		var req models.DeleteRequest
		// Allow empty body for layouts without password
		_ = json.NewDecoder(r.Body).Decode(&req)

		err := s.Delete(id, req.Password)
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrForbidden) || errors.Is(err, store.ErrPasswordNeeded) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// --- Middleware ---

func corsMiddleware(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Simple in-memory rate limiter for write operations.
// Limits per-IP to 1 request per second on mutating endpoints.
var (
	rateMu    sync.Mutex
	rateStore = map[string]time.Time{}
)

func writeRateLimit(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			ip = strings.Split(fwd, ",")[0]
		}
		ip = strings.TrimSpace(ip)

		rateMu.Lock()
		last, ok := rateStore[ip]
		now := time.Now()
		if ok && now.Sub(last) < time.Second {
			rateMu.Unlock()
			http.Error(w, "rate limited", http.StatusTooManyRequests)
			return
		}
		rateStore[ip] = now
		rateMu.Unlock()

		next.ServeHTTP(w, r)
	}
}

// --- Helpers ---

func jsonResponse(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("json encode error: %v", err)
	}
}

func serverError(w http.ResponseWriter, err error) {
	log.Printf("internal error: %v", err)
	http.Error(w, "internal server error", http.StatusInternalServerError)
}
