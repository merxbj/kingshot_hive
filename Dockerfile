# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /build

# Copy Go module files and download deps
COPY backend/go.mod ./backend/
RUN cd backend && go mod download 2>/dev/null || true

# Copy frontend files into the embed directory
COPY index.html backend/cmd/server/frontend/index.html
COPY assets/ backend/cmd/server/frontend/assets/

# Copy backend source
COPY backend/ ./backend/

# Tidy modules and build the binary
RUN cd backend && go mod tidy && CGO_ENABLED=0 go build -o /kingshot-server ./cmd/server

# Runtime stage
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /kingshot-server /usr/local/bin/kingshot-server

RUN addgroup -S app && adduser -S -G app app && mkdir -p /data && chown -R app:app /data

EXPOSE 8080

ENV PORT=8080
ENV DB_PATH=/data/kingshot.db

USER app

ENTRYPOINT ["kingshot-server"]
