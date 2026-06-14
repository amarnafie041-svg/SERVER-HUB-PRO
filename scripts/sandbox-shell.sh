#!/bin/bash
# ELMODMEN Sandbox Shell v6 — Restricted Terminal Environment

SANDBOX_HOME="$SANDBOX_HOME"
SANDBOX_ID="$SANDBOX_ID"

if [ -z "$SANDBOX_HOME" ] || [ -z "$SANDBOX_ID" ]; then
  echo "ERROR: Sandbox not initialized" >&2
  exit 1
fi

cd "$SANDBOX_HOME" || exit 1

# Resource limits for dev servers (liberal)
ulimit -S -t 300       # 5 min CPU time
ulimit -S -f 102400    # 100MB file size
ulimit -S -n 2048      # 2048 open files
ulimit -S -u 200       # 200 processes
ulimit -S -m 512000    # 500MB memory

export PATH="/home/runner/.venv/bin:/home/runner/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="$SANDBOX_HOME"
export SHELL="/bin/bash"
export TERM="xterm-256color"
export PS1="\\[\\e[38;5;46m\\]┌──(\\[\\e[1m\\]\\[\\e[38;5;226m\\]sandbox\\[\\e[0m\\]\\[\\e[38;5;46m\\]㉿\\[\\e[38;5;226m\\]serverhub\\[\\e[0m\\]\\[\\e[38;5;46m\\])-[\\[\\e[38;5;87m\\]\\w\\[\\e[0m\\]\\[\\e[38;5;46m\\]]\\[\\e[0m\\]\n\\[\\e[38;5;46m\\]└─\\[\\e[0m\\]$ "

# Activate Python venv
if [ -f /home/runner/.venv/bin/activate ]; then
  source /home/runner/.venv/bin/activate 2>/dev/null
fi

# Blocked: dangerous system commands (NOT package managers)
BLACKLIST=(
  "sudo" "su" "chroot" "docker" "docker-compose"
  "systemctl" "service" "journalctl"
  "shutdown" "reboot" "poweroff" "halt" "init"
  "mount" "umount" "fdisk" "mkfs" "dd"
  "passwd" "useradd" "usermod" "groupadd"
  "modprobe" "insmod" "rmmod" "lsmod"
  "iptables" "ip6tables" "ufw" "firewalld"
  "crontab" "at" "batch"
  "nsenter" "unshare" "cgexec"
)

RESTRICTED_PATTERNS=(
  "/etc" "/boot" "/dev" "/sys" "/proc"
  "/var/log" "/var/lib" "/root"
)

is_blocked() {
  local cmd="$1"
  for b in "${BLACKLIST[@]}"; do
    if [ "$cmd" = "$b" ] || [[ "$cmd" == "$b "* ]]; then
      return 0
    fi
  done
  return 1
}

has_restricted_path() {
  local cmd="$1"
  for r in "${RESTRICTED_PATTERNS[@]}"; do
    if [[ "$cmd" == *"$r"* ]]; then
      return 0
    fi
  done
  return 1
}

log_command() {
  local cmd="$1"
  echo "[SANDBOX:$SANDBOX_ID] $cmd" >> "$SANDBOX_HOME/.sandbox_history"
}

trap 'run_command "$BASH_COMMAND"' DEBUG

run_command() {
  local cmd="$1"
  if [ -z "$cmd" ] || [ "$cmd" = "$PROMPT_COMMAND" ] || [[ "$cmd" == "trap "* ]]; then
    return
  fi
  local base="${cmd%% *}"
  if is_blocked "$base"; then
    echo -e "\e[1;31m⛔ BLOCKED: '$base' is not allowed in sandbox\e[0m"
    if [ -n "$BASH_EXECUTION_STRING" ]; then
      exit 1
    fi
    return 1
  fi
  if has_restricted_path "$cmd"; then
    echo -e "\e[1;33m⚠️  WARNING: Command touches restricted system paths\e[0m"
  fi
  log_command "$cmd"
}

if [ -f "$SANDBOX_HOME/.sandboxrc" ]; then
  source "$SANDBOX_HOME/.sandboxrc"
fi

if [ ! -f "$SANDBOX_HOME/.banner_shown" ]; then
  echo ""
  echo -e "\e[38;5;46m╔═══════════════════════════════════════════════════════╗\e[0m"
  echo -e "\e[38;5;46m║\e[0m  \e[1m\e[38;5;226m███████╗ █████╗ ███╗   ██╗██████╗ ██████╗  ██████╗ ██╗  ██╗\e[0m  \e[38;5;46m║\e[0m"
  echo -e "\e[38;5;46m║\e[0m  \e[1m\e[38;5;226m██╔════╝██╔══██╗████╗  ██║██╔══██╗██╔══██╗██╔═══██╗██║ ██╔╝\e[0m  \e[38;5;46m║\e[0m"
  echo -e "\e[38;5;46m║\e[0m  \e[1m\e[38;5;226m███████╗███████║██╔██╗ ██║██║  ██║██████╔╝██║   ██║█████╔╝ \e[0m  \e[38;5;46m║\e[0m"
  echo -e "\e[38;5;46m║\e[0m  \e[1m\e[38;5;226m╚════██║██╔══██║██║╚██╗██║██║  ██║██╔══██╗██║   ██║██╔═██╗ \e[0m  \e[38;5;46m║\e[0m"
  echo -e "\e[38;5;46m║\e[0m  \e[1m\e[38;5;226m███████║██║  ██║██║ ╚████║██████╔╝██║  ██║╚██████╔╝██║  ██╗\e[0m  \e[38;5;46m║\e[0m"
  echo -e "\e[38;5;46m║\e[0m  \e[1m\e[38;5;226m╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝\e[0m  \e[38;5;46m║\e[0m"
  echo -e "\e[38;5;46m║\e[0m                                                                       \e[38;5;46m║\e[0m"
  echo -e "\e[38;5;46m║\e[0m  \e[2m\e[38;5;245mSANDBOX v6 — Isolated Terminal Environment                          \e[0m  \e[38;5;46m║\e[0m"
  echo -e "\e[38;5;46m║\e[0m  \e[2m\e[38;5;245mType your commands below — restricted for safety                      \e[0m  \e[38;5;46m║\e[0m"
  echo -e "\e[38;5;46m╚═══════════════════════════════════════════════════════╝\e[0m"
  echo ""
  touch "$SANDBOX_HOME/.banner_shown"
fi

if ! grep -q "welcome" "$SANDBOX_HOME/.zshrc" 2>/dev/null; then
  cat > "$SANDBOX_HOME/.zshrc" << 'ZSHRC'
PROMPT='%F{46}┌──(%F{226}%n%F{46}㉿%F{226}%m%F{46})-[%F{87}%~%F{46}]%f
%F{46}└─%f$ '
RPROMPT=''
ENABLE_CORRECTION="true"
HISTSIZE=1000
SAVEHIST=1000
setopt histignoredups
ZLE_DISABLE_AUTOSUGGEST=true
ZSHRC
fi

exec /bin/bash --norc --noprofile 2>/dev/null || exec /bin/sh
