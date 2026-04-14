.PHONY: build run clean embed

# Copy frontend into backend embed directory
embed:
	mkdir -p backend/cmd/server/frontend/assets
	cp index.html backend/cmd/server/frontend/
	cp -r assets/* backend/cmd/server/frontend/assets/

# Build the Go binary (requires Go 1.22+)
build: embed
	cd backend && go build -o ../kingshot-server ./cmd/server

# Run locally
run: build
	DB_PATH=./data/kingshot.db PORT=8080 ./kingshot-server

# Build and run via Docker Compose
docker:
	docker compose up --build

# Clean build artifacts
clean:
	rm -rf backend/cmd/server/frontend
	rm -f kingshot-server
