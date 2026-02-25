#!/bin/bash
# Discovers the public IP of a running ECS Fargate task.
# Used by Terraform data "external" to resolve the admin app URL.
# Input: JSON on stdin with "cluster" and "service" keys
# Output: JSON with "ip" key (empty string if no task running)

set -e

eval "$(jq -r '@sh "CLUSTER=\(.cluster) SERVICE=\(.service)"')"

# Poll for running task (up to 3 min)
for i in $(seq 1 18); do
  TASK_ARN=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" \
    --query 'taskArns[0]' --output text 2>/dev/null || echo "None")

  if [ "$TASK_ARN" != "None" ] && [ -n "$TASK_ARN" ]; then
    STATUS=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
      --query 'tasks[0].lastStatus' --output text 2>/dev/null || echo "")

    if [ "$STATUS" = "RUNNING" ]; then
      ENI_ID=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
        --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
        --output text 2>/dev/null || echo "")

      if [ -n "$ENI_ID" ] && [ "$ENI_ID" != "None" ]; then
        PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids "$ENI_ID" \
          --query 'NetworkInterfaces[0].Association.PublicIp' --output text 2>/dev/null || echo "")

        if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ]; then
          jq -n --arg ip "$PUBLIC_IP" '{"ip": $ip}'
          exit 0
        fi
      fi
    fi
  fi
  echo "Waiting for ECS task... (attempt $i/18)" >&2
  sleep 10
done

# No running task found
jq -n '{"ip": ""}'
