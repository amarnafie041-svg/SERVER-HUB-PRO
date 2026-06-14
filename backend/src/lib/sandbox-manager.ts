import fs from "fs";
import path from "path";
import os from "os";
import { spawn, type ChildProcess, execSync } from "child_process";
import { logger } from "./logger";

let ptyModule: any = null;
try {
  ptyModule = require("node-pty");
} catch {
  logger.warn("node-pty not available in sandbox, using fallback");
}

interface Sandbox {
  id: string;
  homeDir: string;
  process: ChildProcess | null;
  created: Date;
  lastActivity: Date;
}

const sandboxes = new Map<string, Sandbox>();
const userSandboxes = new Map<string, { id: string; homeDir: string }>();
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const MAX_IDLE = 30 * 60 * 1000;

const isWindows = os.platform() === "win32";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

function createSandboxDirs(baseDir: string): void {
  const dirs = [
    baseDir,
    path.join(baseDir, "projects"),
    path.join(baseDir, "tmp"),
    path.join(baseDir, ".cache"),
    path.join(baseDir, ".local", "share"),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  }
}

function createHomeDir(userId?: string, username?: string): string {
  const id = generateId();
  const name = username ? sanitizeUserId(username) : (userId ? sanitizeUserId(userId) : "unknown");
  const homeRoot = isWindows
    ? (process.env.USERPROFILE || "C:\\Users\\Default")
    : "/home/runner";
  const baseDir = path.resolve(homeRoot, `user_${name}`);
  fs.mkdirSync(baseDir, { recursive: true, mode: 0o755 });
  createSandboxDirs(baseDir);

  const sandboxShell = path.join(baseDir, ".sandbox-shell.sh");
  const shellContent = `#!/bin/bash
export SANDBOX_HOME="${baseDir}"
export SANDBOX_ID="${id}"
export SANDBOX_USER="${name}"
export PATH="/home/runner/.venv/bin:/home/runner/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PS1="\\[\\e[38;5;46m\\]┌──(\\[\\e[1m\\]\\[\\e[38;5;226m\\]user_${name}\\[\\e[0m\\]\\[\\e[38;5;46m\\]㉿\\[\\e[38;5;226m\\]serverhub\\[\\e[0m\\]\\[\\e[38;5;46m\\])-[\\[\\e[38;5;87m\\]\\\\w\\[\\e[0m\\]\\[\\e[38;5;46m\\]]\\[\\e[0m\\]\\n\\[\\e[38;5;46m\\]└─\\[\\e[0m\\]$ "
cd "${baseDir}" || exit 1
ulimit -S -t 300 2>/dev/null
ulimit -S -f 102400 2>/dev/null
ulimit -S -n 2048 2>/dev/null
ulimit -S -u 200 2>/dev/null
# Activate Python venv
if [ -f /home/runner/.venv/bin/activate ]; then
  source /home/runner/.venv/bin/activate 2>/dev/null
fi
BLOCKED=(sudo su chroot docker docker-compose systemctl service journalctl shutdown reboot poweroff halt init mount umount fdisk mkfs dd passwd useradd usermod groupadd modprobe insmod rmmod lsmod iptables ip6tables ufw firewalld crontab at batch nsenter unshare cgexec)
ESC_BLOCKED=(cd.. cd\ ..)
preexec() {
  local cmd="$1"
  local base="\${cmd%% *}"
  for b in "\${BLOCKED[@]}"; do
    if [ "\$base" = "\$b" ]; then
      echo -e "\\e[1;31m⛔ BLOCKED: '\$base' not allowed in sandbox\\e[0m"
      return 1
    fi
  done
  local lower="\$(echo "\$cmd" | tr '[:upper:]' '[:lower:]')"
  if [[ "\$lower" == rm\ * || "\$lower" == *\ rm\ * ]]; then
    if [[ "\$lower" == *-r* || "\$lower" == *-f* || "\$lower" == *--recursive* || "\$lower" == *--force* ]]; then
      echo -e "\\e[1;31m⛔ BLOCKED: 'rm -rf' / 'rm -f' not allowed in sandbox\\e[0m"
      return 1
    fi
  fi
  if [[ "\$cmd" == *".."* || "\$cmd" == *"/"* ]]; then
    local target
    target="\$(eval echo "\$cmd" 2>/dev/null)"
    if [[ "\$target" != "\${SANDBOX_HOME}"* && "\$target" != "."* && "\$target" != "\$HOME"* ]]; then
      echo -e "\\e[1;31m⛔ BLOCKED: Cannot escape sandbox directory\\e[0m"
      return 1
    fi
  fi
  echo "[SANDBOX:${id}] \$cmd" >> "${baseDir}/.sandbox_history"
}
set -o DEBUG 2>/dev/null
`;
  fs.writeFileSync(sandboxShell, shellContent, "utf8");
  fs.chmodSync(sandboxShell, 0o755);

  const sandboxrc = path.join(baseDir, ".sandboxrc");
  const bashrc = path.join(baseDir, ".bashrc");
  const rcContent = `# ELMODMEN SANDBOX v6 - Auto functions

# --- Package managers (allowed) ---
apt() { sudo /usr/bin/apt "$@"; }
apt-get() { sudo /usr/bin/apt-get "$@"; }
dpkg() { sudo /usr/bin/dpkg "$@"; }

# --- Override rm to block -rf / -f ---
rm() {
  local banned=false
  for arg in "$@"; do
    case "$arg" in
      -r*|-f*|--recursive|--force) banned=true ;;
    esac
  done
  if [ "$banned" = true ]; then
    echo -e "\\e[1;31m⛔ BLOCKED: rm -rf / rm -f not allowed in sandbox\\e[0m"
    return 1
  fi
  command rm "$@"
}

# --- cd restricted to sandbox home ---
cd() {
  local target="\${1:-\$HOME}"
  local real_target
  real_target="\$(realpath -m "\$target" 2>/dev/null || echo "\$target")"
  if [[ "\$real_target" != "\${SANDBOX_HOME}"* ]]; then
    echo -e "\\e[1;31m⛔ BLOCKED: Cannot escape sandbox directory via cd\\e[0m"
    return 1
  fi
  builtin cd "\$target"
}

# --- Python virtual env shortcut ---
venv() {
  if [ ! -f /home/runner/.venv/bin/activate ]; then
    python3 -m venv /home/runner/.venv
    /home/runner/.venv/bin/pip install --upgrade pip setuptools wheel
  fi
  source /home/runner/.venv/bin/activate
  echo -e "\\e[38;5;46m✓ Virtualenv activated: /home/runner/.venv\\e[0m"
}

# --- Port cleanup ---
free-port() {
  local port="\$1"
  if [ -z "\$port" ]; then
    echo "Usage: free-port <port>"
    return 1
  fi
  local pids
  pids=\$(lsof -ti :\$port 2>/dev/null)
  if [ -n "\$pids" ]; then
    echo -e "\\e[38;5;226mKilling processes on port \$port: \$pids\\e[0m"
    kill -9 \$pids 2>/dev/null
    echo -e "\\e[38;5;46m✓ Port \$port freed\\e[0m"
  else
    echo -e "\\e[38;5;46m✓ Port \$port is already free\\e[0m"
  fi
}

# --- Show process using a port ---
who-port() {
  local port="\$1"
  if [ -z "\$port" ]; then
    echo "Usage: who-port <port>"
    return 1
  fi
  lsof -i :\$port 2>/dev/null || echo -e "\\e[38;5;245mNo process on port \$port\\e[0m"
}

# --- List all used ports ---
list-ports() {
  echo -e "\\e[1mActive ports:\\e[0m"
  lsof -i -P -n 2>/dev/null | grep LISTEN | awk '{print \$1, \$2, \$9}' | sort -u -k3
}

# --- Auto-serve: run a server on a free port ---
auto-serve() {
  local cmd_template="\$1"
  local start_port="\${2:-8000}"
  local port=\$start_port
  local max_attempts=100
  is_port_free() { ! ss -tlnp "sport = :\$port" 2>/dev/null | grep -q . && return 0 || return 1; }
  if [ -z "\$cmd_template" ]; then
    echo "Usage: auto-serve <command-with-{PORT}> [start_port]"
    echo "Example: auto-serve \"python3 -m http.server {PORT}\" 8000"
    return 1
  fi
  for ((i=0; i<max_attempts; i++)); do
    if is_port_free \$port; then
      local cmd="\${cmd_template//{PORT}/\$port}"
      echo ""
      echo -e "\\e[38;5;46m➜\\e[0m  \\e[1mLocal:\\e[0m   \\e[38;5;87mhttp://localhost:\$port\\e[0m"
      echo -e "\\e[38;5;245mRunning: \$cmd\\e[0m"
      eval "\$cmd"
      return \$?
    fi
    port=\$((port + 1))
  done
  echo -e "\\e[1;31m✖ No free port found after \$max_attempts attempts\\e[0m"
  return 1
}

# --- LocalTunnel ---
lt() {
  local port="\$1"
  if [ -z "\$port" ]; then
    echo "Usage: lt <port>"
    echo "Creates a public URL via localtunnel"
    return 1
  fi
  npx localtunnel --port "\$port"
}

# --- Cloudflare Tunnel ---
cf-tunnel() {
  local port="\$1"
  if [ -z "\$port" ]; then
    echo "Usage: cf-tunnel <port>"
    echo "Creates a public URL via Cloudflare Tunnel"
    return 1
  fi
  cloudflared tunnel --url "http://localhost:\$port"
}
`;
  fs.writeFileSync(sandboxrc, rcContent, "utf8");
  fs.writeFileSync(bashrc, `# ELMODMEN SANDBOX v6 - .bashrc
export SANDBOX_HOME="${baseDir}"
export SANDBOX_ID="${id}"
export SANDBOX_USER="${name}"
export PATH="/home/runner/.venv/bin:/home/runner/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
source /home/runner/.venv/bin/activate 2>/dev/null
source "\${SANDBOX_HOME}/.sandboxrc" 2>/dev/null
export PS1="\\[\\e[38;5;46m\\]┌──(\\[\\e[1m\\]\\[\\e[38;5;226m\\]user_${name}\\[\\e[0m\\]\\[\\e[38;5;46m\\]㉿\\[\\e[38;5;226m\\]serverhub\\[\\e[0m\\]\\[\\e[38;5;46m\\])-[\\[\\e[38;5;87m\\]\\w\\[\\e[0m\\]\\[\\e[38;5;46m\\]]\\[\\e[0m\\]\\n\\[\\e[38;5;46m\\]└─\\[\\e[0m\\]$ "
`, "utf8");

  const zshrc = path.join(baseDir, ".zshrc");
  fs.writeFileSync(zshrc, `export SANDBOX_HOME="${baseDir}"
export SANDBOX_ID="${id}"
export SANDBOX_USER="${name}"
source /home/runner/.venv/bin/activate 2>/dev/null
source "\${SANDBOX_HOME}/.sandboxrc" 2>/dev/null
PROMPT='%F{46}┌──(%F{226}user_${name}%F{46}㉿%F{226}serverhub%F{46})-[%F{87}%~%F{46}]%f
%F{46}└─%f$ '
RPROMPT=''
`, "utf8");

  return baseDir;
}

function getShellPath(): string {
  if (isWindows) {
    const psPath = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    try {
      if (fs.existsSync(psPath)) return psPath;
    } catch {}
    return "cmd.exe";
  }
  const shells = ["/usr/bin/zsh", "/bin/bash", "/usr/bin/bash", "/bin/sh"];
  for (const s of shells) {
    try {
      if (fs.existsSync(s)) return s;
    } catch {}
  }
  return "/bin/sh";
}

function getShellArgs(shell: string, homeDir: string): string[] {
  if (isWindows) {
    if (shell.includes("powershell")) {
      return ["-NoLogo", "-NoProfile", "-Command", `Set-Location '${homeDir}'; Write-Host 'ELMODMEN SANDBOX v6 - Isolated Terminal'`];
    }
    return [];
  }
  if (shell.includes("zsh")) {
    return [];
  }
  return [];
}

export const sandboxManager = {
  isAvailable(): boolean {
    return true;
  },

  createSandbox(userId?: string, username?: string): { id: string; homeDir: string } {
    const id = generateId();
    const homeDir = createHomeDir(userId, username);
    const sandbox: Sandbox = { id, homeDir, process: null, created: new Date(), lastActivity: new Date() };
    sandboxes.set(id, sandbox);
    if (userId) {
      userSandboxes.set(userId, { id, homeDir });
    }
    logger.info({ id, homeDir, userId: userId || "none" }, "Sandbox created");
    return { id, homeDir };
  },

  ensureUserSandbox(userId: string, username?: string): { id: string; homeDir: string } {
    const existing = userSandboxes.get(userId);
    if (existing) {
      const sandbox = sandboxes.get(existing.id);
      if (sandbox) {
        logger.info({ userId, id: existing.id, homeDir: existing.homeDir }, "Reusing existing user sandbox");
        return { id: existing.id, homeDir: existing.homeDir };
      }
      userSandboxes.delete(userId);
    }
    const result = this.createSandbox(userId, username);
    userSandboxes.set(userId, { id: result.id, homeDir: result.homeDir });
    logger.info({ userId, id: result.id, homeDir: result.homeDir }, "User sandbox created");
    return result;
  },

  getUserSandboxHome(userId: string): string | null {
    const entry = userSandboxes.get(userId);
    if (entry) {
      const sandbox = sandboxes.get(entry.id);
      if (sandbox) return sandbox.homeDir;
      userSandboxes.delete(userId);
    }
    return null;
  },

  destroyUserSandbox(userId: string): void {
    const entry = userSandboxes.get(userId);
    if (!entry) return;
    this.destroySandbox(entry.id);
    userSandboxes.delete(userId);
    logger.info({ userId }, "User sandbox destroyed");
  },

  getUserSandboxId(userId: string): string | null {
    const entry = userSandboxes.get(userId);
    if (entry) {
      const sandbox = sandboxes.get(entry.id);
      if (sandbox) return entry.id;
      userSandboxes.delete(userId);
    }
    return null;
  },

  getAllUserSandboxes(): Array<{ userId: string; sandboxId: string; homeDir: string; created: Date }> {
    const result: Array<{ userId: string; sandboxId: string; homeDir: string; created: Date }> = [];
    for (const [userId, entry] of userSandboxes) {
      const sandbox = sandboxes.get(entry.id);
      if (sandbox) {
        result.push({ userId, sandboxId: entry.id, homeDir: entry.homeDir, created: sandbox.created });
      }
    }
    return result;
  },

  spawnShell(
    id: string,
    cols: number = 80,
    rows: number = 24,
    onData: (data: string) => void,
    onExit: () => void
  ): ChildProcess | null {
    const sandbox = sandboxes.get(id);
    if (!sandbox) {
      logger.warn({ id }, "Sandbox not found for spawnShell");
      return null;
    }

    if (isWindows) {
      const shellPath = getShellPath();
      const args = getShellArgs(shellPath, sandbox.homeDir);
      const proc = spawn(shellPath, args, {
        cwd: sandbox.homeDir,
        env: {
          ...process.env,
          SANDBOX_HOME: sandbox.homeDir,
          SANDBOX_ID: id,
          HOME: sandbox.homeDir,
          USERPROFILE: sandbox.homeDir,
          TERM: "xterm-256color",
          PS1: "┌──(sandbox㉿serverhub)-[\\w]\n└─$ ",
        },
        windowsHide: true,
      });

      proc.stdout?.on("data", (chunk: Buffer) => {
        sandbox.lastActivity = new Date();
        onData(chunk.toString("utf8"));
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        sandbox.lastActivity = new Date();
        onData(chunk.toString("utf8"));
      });

      proc.on("exit", () => {
        sandbox.process = null;
        onExit();
      });

      proc.on("error", () => {
        sandbox.process = null;
        onExit();
      });

      sandbox.process = proc;
      return proc;
    }

    const shellPath = getShellPath();
    const args = getShellArgs(shellPath, sandbox.homeDir);

    const env: Record<string, string> = {
      SANDBOX_HOME: sandbox.homeDir,
      SANDBOX_ID: id,
      HOME: sandbox.homeDir,
      SHELL: shellPath,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      PATH: "/home/runner/.venv/bin:/home/runner/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      TERMINFO: "/usr/share/terminfo",
    };

    if (ptyModule) {
      const ptyProcess = ptyModule.spawn(shellPath, args, {
        name: "xterm-256color",
        cols,
        rows,
        cwd: sandbox.homeDir,
        env,
      });

      ptyProcess.onData((data: string) => {
        sandbox.lastActivity = new Date();
        onData(data);
      });

      ptyProcess.onExit(() => {
        sandbox.process = null;
        onExit();
      });

      (ptyProcess as any).write = (data: string) => ptyProcess.write(data);
      sandbox.process = ptyProcess as any;
      return ptyProcess as any;
    }

    const proc = spawn(shellPath, ["-i", ...args], {
      cwd: sandbox.homeDir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      sandbox.lastActivity = new Date();
      onData(chunk.toString("utf8"));
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      sandbox.lastActivity = new Date();
      onData(chunk.toString("utf8"));
    });

    proc.on("exit", () => {
      sandbox.process = null;
      onExit();
    });

    proc.on("error", () => {
      sandbox.process = null;
      onExit();
    });

    sandbox.process = proc;
    return proc;
  },

  writeToShell(id: string, data: string): void {
    const sandbox = sandboxes.get(id);
    if (!sandbox?.process) return;
    sandbox.lastActivity = new Date();
    try {
      if (typeof (sandbox.process as any).write === "function") {
        (sandbox.process as any).write(data);
      } else if (sandbox.process.stdin?.writable) {
        sandbox.process.stdin.write(data);
      }
    } catch {}
  },

  resizeShell(id: string, cols: number, rows: number): void {
    const sandbox = sandboxes.get(id);
    if (!sandbox?.process) return;
    try {
      if (typeof (sandbox.process as any).resize === "function") {
        (sandbox.process as any).resize(cols, rows);
      } else {
        (sandbox.process as any).stdin?.setSize?.(cols, rows);
      }
    } catch {}
  },

  destroySandbox(id: string): void {
    const sandbox = sandboxes.get(id);
    if (!sandbox) return;

    try {
      if (sandbox.process) {
        sandbox.process.kill("SIGKILL");
        sandbox.process = null;
      }
      if (sandbox.homeDir) {
        fs.rmSync(sandbox.homeDir, { recursive: true, force: true });
      }
    } catch (err) {
      logger.warn({ err, id }, "Error destroying sandbox");
    }

    sandboxes.delete(id);
    logger.info({ id }, "Sandbox destroyed and cleaned up");
  },

  getSandbox(id: string): Sandbox | undefined {
    return sandboxes.get(id);
  },

  startCleanupLoop(): void {
    logger.info("Sandbox cleanup loop disabled — sandboxes persist until session ends");
  },

  getStats(): { active: number; totalCreated: number } {
    return {
      active: sandboxes.size,
      totalCreated: sandboxes.size,
    };
  },
};
