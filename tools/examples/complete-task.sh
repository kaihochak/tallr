#!/bin/bash
# Example script to mark a task as DONE

export TALLY_TOKEN=devtoken

echo "Marking the example task as DONE..."

curl -H "Authorization: Bearer $TALLY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "taskId": "example-task-1",
       "details": "Authentication schema implemented successfully"
     }' \
     http://127.0.0.1:4317/v1/tasks/done

echo -e "\n\nTask marked as done!"
echo "The task state should now show as 'DONE' in green"