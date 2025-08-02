#!/bin/bash

# Test script that simulates a CLI waiting for user input
# Use this to test the Tally wrapper and notification system

echo "Starting simulated CLI task..."
sleep 2

echo "Analyzing codebase..."
sleep 3

echo "Found 5 files to modify:"
echo "  - src/components/Auth.tsx"
echo "  - src/api/users.ts"
echo "  - package.json"
echo "  - README.md"
echo "  - .env.example"
sleep 2

echo ""
echo "This will modify authentication flow and add new dependencies."
echo -n "Approve? [y/N]: "

# Wait for user input
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Applying changes..."
    sleep 3
    echo "✓ Updated Auth.tsx"
    sleep 1
    echo "✓ Updated users.ts"
    sleep 1
    echo "✓ Updated package.json"
    sleep 1
    echo "✓ Updated README.md"
    sleep 1
    echo "✓ Updated .env.example"
    echo ""
    echo "All changes applied successfully!"
else
    echo ""
    echo "Changes cancelled by user."
    exit 1
fi