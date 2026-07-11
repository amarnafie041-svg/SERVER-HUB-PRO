import { rmSync, existsSync, readdirSync, copyFileSync } from "fs";
import { build } from "esbuild";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("CWD:", process.cwd());
console.log("__dirname:", __dirname);

const outDir = join(__dirname, "dist");
console.log("Output dir:", outDir);

if (existsSync(outDir)) rmSync(outDir, { recursive: true });

await build({
  entryPoints: [join(__dirname, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir: outDir,
  sourcemap: true,
  external: [
    "bcryptjs",
    "node-pty",
    "sharp",
    "ssh2",
    "fsevents",
    "dockerode",
  ],
  banner: {
    js: (() => {
      const req = createRequire(import.meta.url);
      const threadStreamWorker = req.resolve("thread-stream/lib/worker.js");
      const pinoWorker = req.resolve("pino/lib/worker.js");
      return [
        "import { createRequire } from 'module';",
        "const require = createRequire(import.meta.url);",
        "import { fileURLToPath } from 'url';",
        "import { dirname } from 'path';",
        "const __filename = fileURLToPath(import.meta.url);",
        "const __dirname = dirname(__filename);",
        `globalThis.__bundlerPathsOverrides = {` +
          `\n  'thread-stream-worker': ${JSON.stringify(threadStreamWorker)},` +
            `\n  'pino-worker': ${JSON.stringify(pinoWorker)}\n};`,
      ].join("\n");
    })(),
  },
});

console.log("Build output:", readdirSync(outDir));

// Copy sandbox runners into dist/ so they're accessible at runtime
const runnerFiles = [
  "sandbox_runner.py",
  "sandbox_runner.js",
  "sandbox_runner.php",
  "sandbox_runner.sh",
];
for (const file of runnerFiles) {
  const src = join(__dirname, "src", "lib", file);
  const dest = join(outDir, file);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`Copied ${file} to dist/`);
  } else {
    console.warn(`${file} not found at`, src);
  }
}
