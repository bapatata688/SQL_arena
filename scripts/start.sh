#!/usr/bin/env bash
# ==============================================================================
# SQL ARENA - Launch Script (Linux / macOS)
# ==============================================================================
set -e

echo "🚀 Starting SQL Arena..."

# 1. Start backend
echo "[1/2] Starting Express API on port 5000..."
cd "$(dirname "$0")/../backend"
npm start &
BACKEND_PID=$!

# 2. Start frontend
echo "[2/2] Starting Vite Frontend on port 3000..."
cd ../frontend
npm run dev -- --host 127.0.0.1 --port 3000 &
FRONTEND_PID=$!

echo "✅ SQL Arena running at http://localhost:3000"
echo "Press Ctrl+C to stop all processes."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" EXIT
wait

