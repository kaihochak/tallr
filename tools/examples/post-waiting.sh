#!/bin/bash
# Example script to create a project and task in WAITING_USER state

export TALLY_TOKEN=devtoken

echo "Creating a project with a WAITING_USER task..."

curl -H "Authorization: Bearer $TALLY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "project": {
         "name": "example-project",
         "repoPath": "/Users/you/dev/example-project",
         "preferredIDE": "cursor",
         "githubUrl": "https://github.com/you/example-project"
       },
       "task": {
         "id": "example-task-1",
         "agent": "claude",
         "title": "Implement authentication",
         "state": "WAITING_USER",
         "details": "Please approve the authentication schema. Continue? [y/N]"
       }
     }' \
     http://127.0.0.1:4317/v1/tasks/upsert

echo -e "\n\nTask created! You should see:"
echo "1. A desktop notification (if enabled)"
echo "2. The task appear in the Tally window"
echo "3. The system tray icon tooltip change to 'Tally - Waiting for user'"
echo ""
echo "Click the task in Tally to jump to the project!"