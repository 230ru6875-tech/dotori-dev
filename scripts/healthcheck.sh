#!/usr/bin/env bash
set -euo pipefail

echo "=== dotori-dev EC2 healthcheck ==="
echo "host: $(hostname)"
echo "user: $(whoami)"
echo "pwd:  $(pwd)"
echo "git:  $(git --version)"
echo "python: $(python3 --version)"
echo "node: $(node --version)"
echo "docker: $(docker --version)"
echo "=== OK ==="
