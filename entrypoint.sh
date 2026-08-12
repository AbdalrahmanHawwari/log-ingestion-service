#!/bin/sh
set -e

echo "Running database migrations..."
npx drizzle-kit push --config=drizzle.config.ts || true

echo "Starting application..."
exec "$@"