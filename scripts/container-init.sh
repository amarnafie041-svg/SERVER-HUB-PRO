#!/bin/bash
set -e

export TERM=xterm-256color
export PATH="/home/runner/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

if [ -n "$USERNAME" ]; then
    if ! id "$USERNAME" &>/dev/null; then
        useradd -m -s /bin/bash -u 1000 "$USERNAME" 2>/dev/null || true
    fi
    chown -R 1000:1000 /home/runner
fi

mkdir -p /home/runner/files /home/runner/projects /home/runner/.config /home/runner/tmp

# Activate Python venv
if [ -f /home/runner/.venv/bin/activate ]; then
    source /home/runner/.venv/bin/activate
fi

# Kill any leftover processes from previous sessions
cleanup_ports() {
    for pid in $(lsof -i -P -n 2>/dev/null | grep LISTEN | awk '{print $2}' | sort -u); do
        if [ "$pid" -gt 0 ] 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
}
cleanup_ports 2>/dev/null || true

if [ -f /home/runner/.zshrc ]; then
    chown 1000:1000 /home/runner/.zshrc
fi

echo "Container ready for user: ${USERNAME:-runner}"

exec "$@"
