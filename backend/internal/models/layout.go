package models

import "time"

// Layout represents a full layout stored in the database.
type Layout struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Data         string    `json:"data"`
	PasswordHash string    `json:"-"`
	HasPassword  bool      `json:"has_password"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ListItem is the summary returned by the list endpoint.
type ListItem struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	HasPassword bool      `json:"has_password"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// CreateRequest is the JSON body for POST /api/layouts.
type CreateRequest struct {
	Name     string `json:"name"`
	Data     string `json:"data"`
	Password string `json:"password,omitempty"`
}

// UpdateRequest is the JSON body for PUT /api/layouts/{id}.
type UpdateRequest struct {
	Name     string `json:"name,omitempty"`
	Data     string `json:"data"`
	Password string `json:"password"`
}

// DeleteRequest is the JSON body for DELETE /api/layouts/{id}.
type DeleteRequest struct {
	Password string `json:"password"`
}
