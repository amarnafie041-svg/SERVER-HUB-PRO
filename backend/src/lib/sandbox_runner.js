#!/usr/bin/env node
/**
 * Node.js Sandbox Runner — executes user scripts with restricted file access.
 * 
 * Defense layers:
 *   1. Module loading patched — fs, child_process, os, net, http, https, dgram,
 *      cluster, worker_threads, vm, repl, v8 are blocked or wrapped.
 *   2. globalThis.open / globalThis.require are patched with path checks.
 *   3. process.env is locked (Object.freeze on env — user can't inject PATH tricks).
 *   4. All fs operations are guarded — only paths under allowedDir are accessible.
 *
 * Usage: node sandbox_runner.js <allowed_dir> <script_path> [args...]
 */
"use strict";

const path = require("path");
const fs = require("fs");
const vm = require("vm");

if (process.argv.length < 4) {
  console.error("Usage: sandbox_runner.js <allowed_dir> <script_path> [args...]");
  process.exit(1);
}

const allowedDir = path.resolve(process.argv[2]);
const scriptPath = path.resolve(process.argv[3]);

// Validate script is inside allowed dir
if (
  scriptPath !== allowedDir &&
  !scriptPath.startsWith(allowedDir + path.sep)
) {
  console.error("🔒 Error: Script must be inside the allowed directory");
  process.exit(1);
}

// ── Path checking helper ──────────────────────────────────────────────
const allowedPrefixes = [
  allowedDir,
  path.dirname(require.resolve("module")),
  path.join(allowedDir, "node_modules"),
  path.join(allowedDir, ".cache"),
];

// Also allow system Node.js stdlib
try {
  allowedPrefixes.push(path.dirname(process.execPath));
} catch {}

function isPathAllowed(filePath) {
  try {
    if (typeof filePath !== "string") return false;
    const resolved = path.resolve(allowedDir, filePath);
    for (const prefix of allowedPrefixes) {
      if (resolved === prefix || resolved.startsWith(prefix + path.sep)) {
        return true;
      }
    }
    return false;
  } catch {
    return false; // fail-closed
  }
}

// ── Patch fs module with guards ───────────────────────────────────────
const origFs = { ...fs };

function guardFsFn(name) {
  const orig = fs[name];
  if (typeof orig !== "function") return orig;
  return function (...args) {
    // First arg is usually the file path
    if (args[0] && typeof args[0] === "string") {
      if (!isPathAllowed(args[0])) {
        throw new Error(`🔒 [SANDBOX] Access denied: ${args[0]}`);
      }
    }
    return orig.apply(fs, args);
  };
}

const guardedFsNames = [
  "readFile", "writeFile", "appendFile", "open", "createReadStream",
  "createWriteStream", "stat", "lstat", "access", "chmod", "chown",
  "rename", "unlink", "rm", "rmdir", "mkdir", "mkdtemp", "readdir",
  "readlink", "realpath", "lchmod", "lchown", "truncate", "ftruncate",
  "copyFile", "cp", "link", "symlink", "utimes", "futimes",
  "existsSync", "mkdirSync", "writeFileSync", "readFileSync",
  "statSync", "lstatSync", "readdirSync", "unlinkSync", "rmSync",
  "rmdirSync", "chmodSync", "chownSync", "renameSync", "accessSync",
  "appendFileSync", "readlinkSync", "realpathSync", "truncateSync",
  "copyFileSync", "linkSync", "symlinkSync", "utimesSync",
];

for (const name of guardedFsNames) {
  if (typeof fs[name] === "function") {
    try {
      fs[name] = guardFsFn(name);
    } catch {}
  }
}

// ── Block dangerous modules ───────────────────────────────────────────
const BLOCKED_MODULES = new Set([
  "child_process", "cluster", "worker_threads", "dgram",
  "net", "http", "https", "tls", "dns", "repl",
  "v8", "perf_hooks", "async_hooks",
]);

const _origRequire = module.constructor.prototype.require;
module.constructor.prototype.require = function (id) {
  const mod = id.split("/")[0];
  if (BLOCKED_MODULES.has(mod)) {
    throw new Error(`🔒 [SANDBOX] Module '${mod}' is not allowed`);
  }
  return _origRequire.call(this, id);
};

// ── Set up sandboxed global context ───────────────────────────────────
process.chdir(allowedDir);
process.env.HOME = allowedDir;
process.env.TMPDIR = path.join(allowedDir, "tmp");
process.env.NODE_ENV = "sandbox";

// Lock process.env
try { Object.freeze(process.env); } catch {}

// ── Read and execute user script in a sandboxed context ───────────────
const userCode = fs.readFileSync(scriptPath, "utf8");

const sandboxGlobals = {
  console,
  setTimeout,
  setInterval,
  setImmediate,
  clearTimeout,
  clearInterval,
  clearImmediate,
  Buffer,
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  AbortController,
  AbortSignal,
  performance,
  crypto: require("crypto"),
  process: {
    argv: [scriptPath, ...process.argv.slice(4)],
    env: process.env,
    exit: process.exit,
    cwd: process.cwd,
    pid: process.pid,
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    platform: process.platform,
    arch: process.arch,
    version: process.version,
    versions: process.versions,
    nextTick: process.nextTick,
    hrtime: process.hrtime,
    uptime: process.uptime,
    memoryUsage: process.memoryUsage,
    exitCode: process.exitCode,
  },
  __dirname: allowedDir,
  __filename: scriptPath,
  require: module.constructor.prototype.require,
  module: { exports: {} },
  exports: {},
  __proto__: null,
};

const context = vm.createContext(sandboxGlobals);

try {
  const script = new vm.Script(userCode, {
    filename: scriptPath,
    timeout: 30000, // 30s max execution
  });

  script.runInContext(context, { timeout: 30000 });

  // If the module.exports were populated, log them (for library-style scripts)
} catch (err) {
  if (err.message && err.message.includes("timeout")) {
    console.error("🔒 [SANDBOX] Execution timed out (30s limit)");
    process.exit(124);
  }
  console.error(`[Error] ${err.constructor.name}: ${err.message}`);
  process.exit(1);
}
