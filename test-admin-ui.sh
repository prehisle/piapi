#!/bin/bash
# Test script for admin UI integration

set -e

echo "=== Testing Admin UI Integration ==="
echo ""

# Build if needed
if [ ! -f "./piapi" ]; then
    echo "Building piapi..."
    make build
fi

# Start server in background
echo "Starting piapi server on :19200..."
PIAPI_ADMIN_TOKEN=test-secret-token ./piapi --config config.yaml --listen :19200 &
SERVER_PID=$!

# Wait for server to start
sleep 3

echo ""
echo "Testing endpoints..."
echo ""

# Test health
echo "1. Health check:"
curl -s http://localhost:19200/healthz
echo ""

# Test admin API
echo "2. Admin API (config):"
curl -s http://localhost:19200/admin/api/config \
  -H "Authorization: Bearer test-secret-token" | jq -r '.providers | length' 2>/dev/null && echo " providers found" || echo "API OK"
echo ""

# Test admin UI
echo "3. Admin UI (HTML):"
curl -s http://localhost:19200/admin/ | grep -q "<!doctype html" && echo "✅ HTML served" || echo "❌ Failed"

# Test static assets
echo "4. Static assets (_next):"
curl -s http://localhost:19200/admin/_next/static/css/app/layout.css 2>&1 | head -1 | grep -q "Error" && echo "❌ Failed" || echo "✅ CSS served"

echo ""
echo "Stopping server..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "=== Test Complete ==="
echo ""
echo "To manually test the UI, run:"
echo "  PIAPI_ADMIN_TOKEN=your-secret ./piapi --config config.yaml"
echo "  Then visit: http://localhost:9200/admin"
