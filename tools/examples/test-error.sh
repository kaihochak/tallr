#!/bin/bash

# Test script that simulates a CLI encountering an error
# Use this to test error detection and notification

echo "Starting migration process..."
sleep 2

echo "Connecting to database..."
sleep 2

echo "Running pre-migration checks..."
sleep 3

echo "Error: Connection to database failed"
echo "ERROR: Could not connect to PostgreSQL server"
echo "Failed: Network unreachable (host: localhost:5432)"
sleep 2

echo "Migration aborted."
exit 1