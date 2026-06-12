import fs from "fs";
import path from "path";
import os from "os";
import { spawn, type ChildProcess, execSync } from "child_process";
import { logger } from "./logger";

interface Sandbox {
  id: string;
  homeDir: string;
  process: ChildProcess | null;
  created: Date;
  lastActivity: Date;
}

const sandboxes = new Map<string, Sandbox>();
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const MAX_IDLE = 30 * 60 * 1000;

const isWindows = os.platform() === "win32";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
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
    fs.mkdirSync(d, { recursive: true, mode: 0o755 });
  }
}

function createHomeDir(): string {
  const id = generateId();
  const baseDir = process.env.SANDBOX_BASE_DIR
    ? path.join(process.env.SANDBOX_BASE_DIR, "sandboxes", id)
    : path.join(os.tmpdir(), "sh-sandbox", id);
  createSandboxDirs(baseDir);

  const sandboxShell = path.join(baseDir, ".sandbox-shell.sh");
  const shellContent = `#!/bin/bash
export SANDBOX_HOME="${baseDir.replace(/\\/g, "/")}"
export SANDBOX_ID="${id}"
export PS1="\\[\\e[38;5;46m\\]┌──(\\[\\e[1m\\]\\[\\e[38;5;226m\\]sandbox\\[\\e[0m\\]\\[\\e[38;5;46m\\]㉿\\[\\e[38;5;226m\\]serverhub\\[\\e[0m\\]\\[\\e[38;5;46m\\])-[\\[\\e[38;5;87m\\]\\\\w\\[\\e[0m\\]\\[\\e[38;5;46m\\]]\\[\\e[0m\\]\\n\\[\\e[38;5;46m\\]└─\\[\\e[0m\\]$ "
cd "${baseDir.replace(/\\/g, "/")}" || exit 1
ulimit -S -t 30 2>/dev/null
ulimit -S -f 10240 2>/dev/null
ulimit -S -n 64 2>/dev/null
ulimit -S -u 50 2>/dev/null
BLOCKED=(sudo su chroot docker docker-compose systemctl service journalctl shutdown reboot poweroff halt init mount umount fdisk mkfs dd passwd useradd usermod groupadd modprobe insmod rmmod lsmod iptables ip6tables ufw firewalld crontab at batch nsenter unshare cgexec apt apt-get dpkg yum dnf pacman rpm)
preexec() {
  local cmd="$1"
  local base="\${cmd%% *}"
  for b in "\${BLOCKED[@]}"; do
    if [ "\$base" = "\$b" ]; then
      echo -e "\\e[1;31m⛔ BLOCKED: '\$base' not allowed in sandbox\\e[0m"
      return 1
    fi
  done
  echo "[SANDBOX:${id}] \$cmd" >> "${baseDir.replace(/\\/g, "/")}/.sandbox_history"
}
set -o DEBUG 2>/dev/null
`;
  fs.writeFileSync(sandboxShell, shellContent, "utf8");
  fs.chmodSync(sandboxShell, 0o755);

  const sandboxrc = path.join(baseDir, ".sandboxrc");
  const bashrc = path.join(baseDir, ".bashrc");
  const rcContent = `# ELMODMEN SANDBOX v6 - Auto functions
auto-serve() {
  local cmd_template="$1"
  local start_port="\${2:-8000}"
  local port=$start_port
  local max_attempts=100
  is_port_free() { ! ss -tlnp "sport = :$port" 2>/dev/null | grep -q . && return 0 || return 1; }
  get_local_ip() { ip -4 addr show 2>/dev/null | grep -oP 'inet \\K[\\d.]+' | grep -v '127.0.0.1' | head -1; }
  if [ -z "$cmd_template" ]; then
    echo "Usage: auto-serve <command-with-{PORT}> [start_port]"
    echo "Example: auto-serve \"python3 -m http.server {PORT}\" 8000"
    return 1
  fi
  for ((i=0; i<max_attempts; i++)); do
    if is_port_free $port; then
      local ip=$(get_local_ip)
      local cmd="\${cmd_template//{PORT}/$port}"
      echo ""
      echo -e "\\e[38;5;46m➜\\e[0m  \\e[1mLocal:\\e[0m   \\e[38;5;87mhttp://localhost:$port\\e[0m"
      [ -n "$ip" ] && echo -e "\\e[38;5;46m➜\\e[0m  \\e[1mNetwork:\\e[0m \\e[38;5;87mhttp://$ip:$port\\e[0m"
      echo -e "\\e[38;5;245mRunning: $cmd\\e[0m"
      eval "$cmd"
      return $?
    fi
    port=$((port + 1))
  done
  echo "No free port found after $max_attempts attempts"
  return 1
}
`;
  fs.writeFileSync(sandboxrc, rcContent, "utf8");
  fs.writeFileSync(bashrc, `# ELMODMEN SANDBOX v6 - .bashrc
export SANDBOX_HOME="${baseDir.replace(/\\/g, "/")}"
export SANDBOX_ID="${id}"
source "\${SANDBOX_HOME}/.sandboxrc" 2>/dev/null
export PS1="\\[\\e[38;5;46m\\]┌──(\\[\\e[1m\\]\\[\\e[38;5;226m\\]sandbox\\[\\e[0m\\]\\[\\e[38;5;46m\\]㉿\\[\\e[38;5;226m\\]serverhub\\[\\e[0m\\]\\[\\e[38;5;46m\\])-[\\[\\e[38;5;87m\\]\\w\\[\\e[0m\\]\\[\\e[38;5;46m\\]]\\[\\e[0m\\]\\n\\[\\e[38;5;46m\\]└─\\[\\e[0m\\]$ "
`, "utf8");

  const zshrc = path.join(baseDir, ".zshrc");
  fs.writeFileSync(zshrc, `export SANDBOX_HOME="${baseDir.replace(/\\/g, "/")}"
export SANDBOX_ID="${id}"
source "\${SANDBOX_HOME}/.sandboxrc" 2>/dev/null
PROMPT='%F{46}┌──(%F{226}sandbox%F{46}㉿%F{226}serverhub%F{46})-[%F{87}%~%F{46}]%f
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

  createSandbox(): { id: string; homeDir: string } {
    const id = generateId();
    const homeDir = createHomeDir();
    const sandbox: Sandbox = { id, homeDir, process: null, created: new Date(), lastActivity: new Date() };
    sandboxes.set(id, sandbox);
    logger.info({ id, homeDir }, "Sandbox created");
    return { id, homeDir };
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
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      TERMINFO: "/usr/share/terminfo",
    };

    const proc = spawn(shellPath, args, {
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
    if (sandbox?.process?.stdin?.writable) {
      sandbox.lastActivity = new Date();
      sandbox.process.stdin.write(data);
    }
  },

  resizeShell(id: string, cols: number, rows: number): void {
    const sandbox = sandboxes.get(id);
    if (sandbox?.process) {
      try {
        (sandbox.process as any).stdin?.setSize?.(cols, rows);
      } catch {}
    }
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
    setInterval(() => {
      const now = Date.now();
      for (const [id, sandbox] of sandboxes.entries()) {
        const idle = now - sandbox.lastActivity.getTime();
        if (idle > MAX_IDLE) {
          logger.info({ id, idleMs: idle }, "Cleaning up idle sandbox");
          this.destroySandbox(id);
        }
      }
    }, CLEANUP_INTERVAL);
    logger.info("Sandbox cleanup loop started");
  },

  getStats(): { active: number; totalCreated: number } {
    return {
      active: sandboxes.size,
      totalCreated: sandboxes.size,
    };
  },
};
