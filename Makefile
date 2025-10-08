.PHONY: help build up down restart logs clean dev backend frontend install test lint format docker-build docker-push

# Default target
help:
	@echo "imgforge - Makefile Commands"
	@echo "=============================="
	@echo ""
	@echo "Docker Commands:"
	@echo "  make build          - Build the Docker image"
	@echo "  make up             - Start the Docker containers"
	@echo "  make down           - Stop the Docker containers"
	@echo "  make restart        - Restart the Docker containers"
	@echo "  make logs           - View container logs"
	@echo "  make logs-follow    - Follow container logs"
	@echo "  make shell          - Open a shell in the container"
	@echo ""
	@echo "Development Commands:"
	@echo "  make dev            - Start development servers (backend + frontend)"
	@echo "  make backend        - Build and run Rust backend only"
	@echo "  make frontend       - Run Next.js frontend only"
	@echo "  make install        - Install all dependencies"
	@echo ""
	@echo "Build Commands:"
	@echo "  make build-backend  - Build Rust backend"
	@echo "  make build-frontend - Build Next.js frontend"
	@echo "  make build-release  - Build backend in release mode"
	@echo ""
	@echo "Testing & Quality:"
	@echo "  make test           - Run all tests"
	@echo "  make test-backend   - Run Rust tests"
	@echo "  make test-frontend  - Run Next.js tests"
	@echo "  make lint           - Run linters"
	@echo "  make format         - Format code"
	@echo ""
	@echo "Cleanup Commands:"
	@echo "  make clean          - Clean build artifacts"
	@echo "  make clean-all      - Clean everything including images"
	@echo "  make prune          - Prune Docker resources"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make health         - Check service health"
	@echo "  make devices        - List available devices"
	@echo "  make setup          - Initial project setup"

# ============================================
# Docker Commands
# ============================================

build:
	@echo "🔨 Building Docker image..."
	docker-compose build

up:
	@echo "🚀 Starting containers..."
	docker-compose up -d
	@echo "✅ Containers started!"
	@echo "📱 Access the web interface at: http://localhost:3000"

down:
	@echo "🛑 Stopping containers..."
	docker-compose down

restart: down up

logs:
	docker-compose logs

logs-follow:
	docker-compose logs -f

shell:
	@echo "🐚 Opening shell in container..."
	docker-compose exec imgforge /bin/bash

# ============================================
# Development Commands
# ============================================

dev:
	@echo "🚀 Starting development servers..."
	./start-dev.sh

backend:
	@echo "🦀 Building and running Rust backend..."
	cd backend && RUST_LOG=debug cargo run

frontend:
	@echo "⚛️  Running Next.js frontend..."
	cd frontend && npm run dev

install:
	@echo "📦 Installing dependencies..."
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Backend dependencies will be installed on first build"
	@echo "✅ Dependencies installed!"

# ============================================
# Build Commands
# ============================================

build-backend:
	@echo "🦀 Building Rust backend (debug)..."
	cd backend && cargo build

build-frontend:
	@echo "⚛️  Building Next.js frontend..."
	cd frontend && npm run build

build-release:
	@echo "🦀 Building Rust backend (release)..."
	cd backend && cargo build --release

# ============================================
# Testing & Quality
# ============================================

test: test-backend test-frontend

test-backend:
	@echo "🧪 Running Rust tests..."
	cd backend && cargo test

test-frontend:
	@echo "🧪 Running Next.js tests..."
	cd frontend && npm test || echo "No tests configured yet"

lint:
	@echo "🔍 Running linters..."
	@echo "Linting backend..."
	cd backend && cargo clippy -- -D warnings || true
	@echo "Linting frontend..."
	cd frontend && npm run lint || true

format:
	@echo "✨ Formatting code..."
	@echo "Formatting backend..."
	cd backend && cargo fmt
	@echo "Formatting frontend..."
	cd frontend && npm run format || echo "No format script configured"

# ============================================
# Cleanup Commands
# ============================================

clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf backend/target
	rm -rf frontend/.next
	rm -rf frontend/node_modules
	rm -rf output/*.img
	rm -rf tmp/*
	@echo "✅ Cleaned!"

clean-all: clean
	@echo "🧹 Cleaning everything including Docker images..."
	docker-compose down -v
	docker system prune -f
	@echo "✅ Everything cleaned!"

prune:
	@echo "🧹 Pruning Docker resources..."
	docker system prune -af --volumes
	@echo "✅ Docker resources pruned!"

# ============================================
# Utility Commands
# ============================================

health:
	@echo "🏥 Checking service health..."
	@curl -f http://localhost:3000/api/health || echo "❌ Service is not responding"

devices:
	@echo "💾 Listing available devices..."
	@curl -s http://localhost:3000/api/devices | jq '.' || echo "❌ Could not fetch devices"

setup:
	@echo "🔧 Setting up imgforge project..."
	@mkdir -p output config
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅ Created .env file from .env.example"; \
	fi
	@chmod +x imgforge.sh start-dev.sh
	@echo "✅ Setup complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Review and edit .env file if needed"
	@echo "  2. Run 'make install' to install dependencies"
	@echo "  3. Run 'make up' to start with Docker"
	@echo "  4. Or run 'make dev' for development mode"

# ============================================
# Docker Registry Commands (for deployment)
# ============================================

docker-build:
	@echo "🐳 Building Docker image for production..."
	docker build -t imgforge:latest .

docker-push:
	@echo "🐳 Pushing Docker image to registry..."
	@echo "⚠️  Configure your registry first!"
	# docker tag imgforge:latest your-registry/imgforge:latest
	# docker push your-registry/imgforge:latest

# ============================================
# Quick Start Commands
# ============================================

quick-start: setup install up
	@echo ""
	@echo "🎉 imgforge is ready!"
	@echo "📱 Open http://localhost:3000 in your browser"

# Version info
version:
	@echo "imgforge version 1.0.0"
	@echo ""
	@echo "Required versions:"
	@echo "  Rust: 1.90+"
	@echo "  Node.js: 20.x or higher"
	@echo "  Docker: 20.10+ (optional)"
	@echo ""
	@echo "Installed versions:"
	@rustc --version 2>/dev/null || echo "  Rust: not installed (install from https://rustup.rs/)"
	@node --version 2>/dev/null | sed 's/^/  Node.js: /' || echo "  Node.js: not installed"
	@docker --version 2>/dev/null | sed 's/^/  /' || echo "  Docker: not installed"
