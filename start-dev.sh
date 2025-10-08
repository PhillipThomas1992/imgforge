#!/bin/bash

set -e

echo "🔨 imgforge - Development Startup Script"
echo "========================================="
echo ""

# Check if running from project root
if [ ! -f "imgforge.sh" ]; then
    echo "❌ Error: Please run this script from the imgforge project root directory"
    exit 1
fi

# Check for Rust
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Rust/Cargo is not installed"
    echo "   Install from: https://rustup.rs/"
    exit 1
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "   Install from: https://nodejs.org/"
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Install backend dependencies
echo "📦 Setting up Rust backend..."
cd backend
if [ ! -d "target" ]; then
    echo "   Building backend for the first time (this may take a while)..."
fi
cd ..

# Install frontend dependencies
echo "📦 Setting up Next.js frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "   Installing npm dependencies..."
    npm install
fi
cd ..

echo ""
echo "🚀 Starting development servers..."
echo ""
echo "   Frontend (Next.js): http://localhost:3000"
echo "   Backend (Rust API): http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down development servers..."
    jobs -p | xargs -r kill 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend in background on port 3001
cd backend
echo "Starting backend on port 3001..."
cargo build
PORT=3001 RUST_LOG=debug sudo ./target/debug/imgforge-backend &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend in background on port 3000
cd frontend
echo "Starting frontend on port 3000..."
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Both services are starting up..."
echo ""
echo "📝 Open http://localhost:3000 in your browser"
echo "📝 Backend API: http://localhost:3001/api"
echo "📝 Press Ctrl+C to stop all services"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
