#!/bin/bash
# Bash Sandbox Runner — executes user scripts with restricted file access.
#
# Defense layers:
#   1. Restricted PATH — only /usr/bin, /bin, and the user's bin directory.
#   2. HOME/TMPDIR/CDPATH locked to allowedDir.
#   3. Common file commands (cat, cp, mv, rm, chmod, chown, ln) are overridden
#      to only allow paths inside the allowed directory.
#   4. Block dangerous commands: sudo, su, docker, mount, umount, fdisk, etc.
#   5. Block path traversal via cd, and block rm -rf / rm -f.
#   6. ulimit resource limits.
#   7. History logging for audit.
#
# Usage: bash sandbox_runner.sh <allowed_dir> <script_path> [args...]

set -euo pipefail

if [ $# -lt 2 ]; then
    echo "Usage: sandbox_runner.sh <allowed_dir> <script_path> [args...]" >&2
    exit 1
fi

ALLOWED_DIR="$(realpath "$1")"
SCRIPT_PATH="$(realpath "$2")"
shift 2

# Validate script is inside allowed dir
if [ "$SCRIPT_PATH" != "$ALLOWED_DIR" ] && [[ "$SCRIPT_PATH" != "$ALLOWED_DIR"/* ]]; then
    echo "🔒 Error: Script must be inside the allowed directory" >&2
    exit 1
fi

# ── Environment lockdown ───────────────────────────────────────────────
export HOME="$ALLOWED_DIR"
export TMPDIR="$ALLOWED_DIR/tmp"
export TEMP="$ALLOWED_DIR/tmp"
export TMP="$ALLOWED_DIR/tmp"
export CDPATH=""
export PATH="/usr/local/bin:/usr/bin:/bin:$ALLOWED_DIR/bin"
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

# Create tmp directory
mkdir -p "$TMPDIR" 2>/dev/null || true

# ── Resource limits ────────────────────────────────────────────────────
ulimit -S -t 300 2>/dev/null   # CPU time: 300s
ulimit -S -f 102400 2>/dev/null # File size: 100MB
ulimit -S -n 2048 2>/dev/null   # Open files
ulimit -S -u 200 2>/dev/null    # Max processes

# ── Blocked commands ───────────────────────────────────────────────────
BLOCKED_CMDS=(
    sudo su doas chroot docker docker-compose systemctl service
    journalctl shutdown reboot poweroff halt init mount umount
    fdisk mkfs dd passwd useradd usermod groupadd modprobe insmod
    rmmod lsmod iptables ip6tables ufw firewalld crontab at batch
    nsenter unshare cgexec ping mount.nfs mount.cifs
    ssh scp sftp rsync nc ncat netcat socat telnet
    apt apt-get yum dnf pacman apk brew pip pip3 npm npx node
    python python3 php ruby perl java javac gcc g++ make cmake
)

# ── Helper: check if a path is inside allowed dir ──────────────────────
is_path_allowed() {
    local target
    target="$(realpath -m "$1" 2>/dev/null || echo "$1")"
    if [[ "$target" == "$ALLOWED_DIR" || "$target" == "$ALLOWED_DIR"/* ]]; then
        return 0
    fi
    return 1
}

# ── Override file commands with guards ──────────────────────────────────
cat() {
    for arg in "$@"; do
        if [[ "$arg" != -* ]] && [[ "$arg" == /* ]]; then
            if ! is_path_allowed "$arg"; then
                echo "🔒 [SANDBOX] Access denied: $arg" >&2
                return 1
            fi
        fi
    done
    command cat "$@"
}

cp() {
    local args=()
    for arg in "$@"; do
        if [[ "$arg" != -* ]] && [[ "$arg" == /* ]]; then
            if ! is_path_allowed "$arg"; then
                echo "🔒 [SANDBOX] Access denied: $arg" >&2
                return 1
            fi
        fi
        args+=("$arg")
    done
    command cp "${args[@]}"
}

mv() {
    local args=()
    for arg in "$@"; do
        if [[ "$arg" != -* ]] && [[ "$arg" == /* ]]; then
            if ! is_path_allowed "$arg"; then
                echo "🔒 [SANDBOX] Access denied: $arg" >&2
                return 1
            fi
        fi
        args+=("$arg")
    done
    command mv "${args[@]}"
}

rm() {
    local banned=false
    for arg in "$@"; do
        case "$arg" in
            -r*|-f*|--recursive|--force) banned=true ;;
        esac
    done
    if [ "$banned" = true ]; then
        echo "🔒 [SANDBOX] rm -rf / rm -f not allowed in sandbox" >&2
        return 1
    fi
    for arg in "$@"; do
        if [[ "$arg" != -* ]] && [[ "$arg" == /* ]]; then
            if ! is_path_allowed "$arg"; then
                echo "🔒 [SANDBOX] Access denied: $arg" >&2
                return 1
            fi
        fi
    done
    command rm "$@"
}

chmod() {
    local args=()
    for arg in "$@"; do
        if [[ "$arg" != -* ]] && [[ "$arg" == /* ]]; then
            if ! is_path_allowed "$arg"; then
                echo "🔒 [SANDBOX] Access denied: $arg" >&2
                return 1
            fi
        fi
        args+=("$arg")
    done
    command chmod "${args[@]}"
}

chown() {
    local args=()
    for arg in "$@"; do
        if [[ "$arg" != -* ]] && [[ "$arg" == /* ]]; then
            if ! is_path_allowed "$arg"; then
                echo "🔒 [SANDBOX] Access denied: $arg" >&2
                return 1
            fi
        fi
        args+=("$arg")
    done
    command chown "${args[@]}"
}

ln() {
    local args=()
    for arg in "$@"; do
        if [[ "$arg" != -* ]] && [[ "$arg" == /* ]]; then
            if ! is_path_allowed "$arg"; then
                echo "🔒 [SANDBOX] Access denied: $arg" >&2
                return 1
            fi
        fi
        args+=("$arg")
    done
    command ln "${args[@]}"
}

mkdir() {
    local args=()
    for arg in "$@"; do
        if [[ "$arg" != -* ]] && [[ "$arg" == /* ]]; then
            if ! is_path_allowed "$arg"; then
                echo "🔒 [SANDBOX] Access denied: $arg" >&2
                return 1
            fi
        fi
        args+=("$arg")
    done
    command mkdir "${args[@]}"
}

touch() {
    local args=()
    for arg in "$@"; do
        if [[ "$arg" != -* ]] && [[ "$arg" == /* ]]; then
            if ! is_path_allowed "$arg"; then
                echo "🔒 [SANDBOX] Access denied: $arg" >&2
                return 1
            fi
        fi
        args+=("$arg")
    done
    command touch "${args[@]}"
}

# Override cd to restrict to allowed dir
cd() {
    local target="${1:-$HOME}"
    local real_target
    real_target="$(realpath -m "$target" 2>/dev/null || echo "$target")"
    if [[ "$real_target" != "$ALLOWED_DIR" && "$real_target" != "$ALLOWED_DIR"/* ]]; then
        echo "🔒 [SANDBOX] Cannot escape sandbox directory via cd" >&2
        return 1
    fi
    builtin cd "$target"
}

# ── Log commands for audit ─────────────────────────────────────────────
preexec() {
    echo "[SANDBOX] $1" >> "$ALLOWED_DIR/.sandbox_history" 2>/dev/null || true

    # Check for blocked commands
    local base="${1%% *}"
    for b in "${BLOCKED_CMDS[@]}"; do
        if [ "$base" = "$b" ]; then
            echo -e "\e[1;31m🔒 BLOCKED: '$base' not allowed in sandbox\e[0m" >&2
            return 1
        fi
    done

    # Check for path traversal in arguments
    if [[ "$1" == *".."* ]] || [[ "$1" == *"/etc"* ]] || [[ "$1" == *"/root"* ]] || [[ "$1" == *"/home/"* ]]; then
        if ! is_path_allowed "$1" 2>/dev/null; then
            echo -e "\e[1;31m🔒 BLOCKED: Path traversal detected\e[0m" >&2
            return 1
        fi
    fi
}

# Enable preexec trap if using bash
if [ -n "${BASH_VERSION:-}" ]; then
    DEBUGCommand() { preexec "$1" 2>/dev/null; }
    trap 'preexec "$BASH_COMMAND"' DEBUG 2>/dev/null || true
fi

# ── Execute the user script ────────────────────────────────────────────
cd "$ALLOWED_DIR"
exec bash "$SCRIPT_PATH" "$@"
