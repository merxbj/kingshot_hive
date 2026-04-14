package store

import (
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"

	"github.com/kingshot-hive/backend/internal/models"
)

var (
	ErrNotFound      = errors.New("layout not found")
	ErrForbidden     = errors.New("incorrect password")
	ErrPasswordNeeded = errors.New("password required")
)

// Store defines the layout persistence interface.
type Store interface {
	List() ([]models.ListItem, error)
	Get(id string) (*models.Layout, error)
	Create(req models.CreateRequest) (*models.Layout, error)
	Update(id string, req models.UpdateRequest) error
	Delete(id string, password string) error
}

// SQLiteStore implements Store backed by SQLite.
type SQLiteStore struct {
	db *sql.DB
}

// New opens (or creates) the SQLite database and runs migrations.
func New(dbPath string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	// Enable WAL mode for better concurrent read performance.
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, err
	}

	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}

	return &SQLiteStore{db: db}, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS layouts (
			id            TEXT PRIMARY KEY,
			name          TEXT NOT NULL,
			data          TEXT NOT NULL,
			password_hash TEXT,
			created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`)
	return err
}

// Close closes the underlying database connection.
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

func (s *SQLiteStore) List() ([]models.ListItem, error) {
	rows, err := s.db.Query(
		"SELECT id, name, password_hash, created_at, updated_at FROM layouts ORDER BY updated_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.ListItem
	for rows.Next() {
		var item models.ListItem
		var pwHash sql.NullString
		if err := rows.Scan(&item.ID, &item.Name, &pwHash, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		item.HasPassword = pwHash.Valid && pwHash.String != ""
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *SQLiteStore) Get(id string) (*models.Layout, error) {
	var l models.Layout
	var pwHash sql.NullString
	err := s.db.QueryRow(
		"SELECT id, name, data, password_hash, created_at, updated_at FROM layouts WHERE id = ?", id,
	).Scan(&l.ID, &l.Name, &l.Data, &pwHash, &l.CreatedAt, &l.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	l.HasPassword = pwHash.Valid && pwHash.String != ""
	l.PasswordHash = pwHash.String
	return &l, nil
}

func (s *SQLiteStore) Create(req models.CreateRequest) (*models.Layout, error) {
	id := uuid.New().String()
	now := time.Now().UTC()

	var pwHash sql.NullString
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
		if err != nil {
			return nil, err
		}
		pwHash = sql.NullString{String: string(hash), Valid: true}
	}

	_, err := s.db.Exec(
		"INSERT INTO layouts (id, name, data, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		id, req.Name, req.Data, pwHash, now, now,
	)
	if err != nil {
		return nil, err
	}

	return &models.Layout{
		ID:          id,
		Name:        req.Name,
		Data:        req.Data,
		HasPassword: pwHash.Valid,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (s *SQLiteStore) Update(id string, req models.UpdateRequest) error {
	layout, err := s.Get(id)
	if err != nil {
		return err
	}

	if layout.PasswordHash != "" {
		if req.Password == "" {
			return ErrPasswordNeeded
		}
		if err := bcrypt.CompareHashAndPassword([]byte(layout.PasswordHash), []byte(req.Password)); err != nil {
			return ErrForbidden
		}
	}

	name := req.Name
	if name == "" {
		name = layout.Name
	}

	_, err = s.db.Exec(
		"UPDATE layouts SET name = ?, data = ?, updated_at = ? WHERE id = ?",
		name, req.Data, time.Now().UTC(), id,
	)
	return err
}

func (s *SQLiteStore) Delete(id string, password string) error {
	layout, err := s.Get(id)
	if err != nil {
		return err
	}

	if layout.PasswordHash != "" {
		if password == "" {
			return ErrPasswordNeeded
		}
		if err := bcrypt.CompareHashAndPassword([]byte(layout.PasswordHash), []byte(password)); err != nil {
			return ErrForbidden
		}
	}

	_, err = s.db.Exec("DELETE FROM layouts WHERE id = ?", id)
	return err
}
