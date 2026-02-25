#!/bin/sh
# Generate self-signed TLS certificate for HTTPS
openssl req -x509 -newkey rsa:2048 -keyout /app/certs/server.key \
  -out /app/certs/server.crt -days 365 -nodes \
  -subj "/CN=admin-app" 2>/dev/null

exec node dist/server.js
