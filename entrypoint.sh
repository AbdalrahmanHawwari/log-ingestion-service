#!/bin/sh
set -e

echo "Running database migrations..."
npx drizzle-kit push:pg

echo "Starting application..."
exec "$@"