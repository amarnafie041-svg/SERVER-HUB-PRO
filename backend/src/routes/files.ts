import { Router, type IRouter } from "express";
import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { execFile, execSync } from "child_process";
import { promisify } from "util";
import { logger } from "../lib/logger";
import { authenticate } from "../middleware/authenticate";
import { dockerManager } from "../lib/docker-manager";
import { sandboxManager } from "../lib/sandbox-manager";

const execFileAsync = promisify(execFile);

const router: IRouter = Router();

const FALLBACK_BASE_DIR = process.env.FILES_BASE_DIR || process.env.HOME || process.env.USERPROFILE || "/";

function safePath(requestPath: string, baseDir?: string): string | null {
  const root = baseDir || FALLBACK_BASE_DIR;
  const normalized = path.normalize(requestPath);
  if (path.isAbsolute(normalized)) {
    if (!normalized.startsWith(root)) return null;
    return normalized;
  }
  const resolved = path.resolve(root, normalized);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function getUserBaseDir(userId: string): string {
  const home = sandboxManager.getUserSandboxHome(userId);
  if (home) return home;
  sandboxManager.ensureUserSandbox(userId);
  return sandboxManager.getUserSandboxHome(userId) || FALLBACK_BASE_DIR;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function getFileIcon(name: string, isDir: boolean): string {
  if (isDir) return "folder";
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".jsx": "javascript", ".tsx": "typescript", ".html": "html",
    ".htm": "html", ".css": "css", ".php": "php", ".json": "json",
    ".xml": "xml", ".md": "markdown", ".txt": "text", ".sh": "shell",
    ".bash": "shell", ".zip": "archive", ".tar": "archive", ".gz": "archive",
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image",
    ".svg": "image", ".mp4": "video", ".mp3": "audio", ".pdf": "pdf",
    ".sql": "database", ".yml": "yaml", ".yaml": "yaml", ".go": "go",
    ".rs": "rust", ".java": "java", ".rb": "ruby", ".cpp": "cpp",
    ".c": "c", ".h": "c", ".vue": "vue", ".toml": "toml", ".env": "env",
  };
  return map[ext] || "file";
}

function getLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".jsx": "javascript", ".tsx": "typescript", ".html": "html",
    ".htm": "html", ".css": "css", ".php": "php", ".json": "json",
    ".xml": "xml", ".md": "markdown", ".txt": "plaintext", ".sh": "shell",
    ".bash": "shell", ".sql": "sql", ".yml": "yaml", ".yaml": "yaml",
    ".go": "go", ".rs": "rust", ".java": "java", ".rb": "ruby",
    ".cpp": "cpp", ".c": "c", ".h": "c", ".vue": "html",
    ".toml": "toml", ".env": "shell",
  };
  return map[ext] || "plaintext";
}

function isTextFile(filePath: string): boolean {
  const textExts = new Set([
    ".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".htm", ".css",
    ".php", ".json", ".xml", ".yaml", ".yml", ".md", ".txt", ".sh",
    ".bash", ".env", ".cfg", ".conf", ".ini", ".sql", ".rb", ".go",
    ".rs", ".cpp", ".c", ".h", ".java", ".vue", ".log", ".csv",
    ".toml", ".lock", ".mod", ".gitignore", ".htaccess",
  ]);
  const ext = path.extname(filePath).toLowerCase();
  if (textExts.has(ext)) return true;
  if (!ext) {
    try {
      const chunk = fs.readFileSync(filePath).slice(0, 512);
      return !chunk.includes(0);
    } catch {
      return false;
    }
  }
  return false;
}

function getFileInfo(filePath: string): {
  name: string; path: string; is_dir: boolean; size: string;
  size_bytes: number; modified: string; ext: string; icon: string; language: string;
} | null {
  try {
    const stat = fs.statSync(filePath);
    const name = path.basename(filePath);
    const isDir = stat.isDirectory();
    const ext = isDir ? "" : path.extname(name).toLowerCase().slice(1);
    return {
      name, path: filePath, is_dir: isDir,
      size: isDir ? "-" : formatBytes(stat.size),
      size_bytes: stat.size,
      modified: new Date(stat.mtime).toISOString().slice(0, 16).replace("T", " "),
      ext, icon: getFileIcon(name, isDir),
      language: isDir ? "" : getLanguage(filePath),
    };
  } catch {
    return null;
  }
}

async function ensureUserIsolation(userId: string, username: string): Promise<void> {
  if (dockerManager.isAvailable) {
    await dockerManager.ensureContainer(username, userId);
  } else {
    sandboxManager.ensureUserSandbox(userId);
  }
}

router.get("/files/list", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.user?.username || "";
    const userId = req.user?.userId || "";
    await ensureUserIsolation(userId, username);
    const reqPath = (req.query.path as string) || "/";

    if (dockerManager.isAvailable) {
      const items = await dockerManager.execFileList(username, reqPath);
      if (items) {
        res.json({ path: reqPath, items });
        return;
      }
    }

    const baseDir = getUserBaseDir(userId);
    const dirPath = safePath(reqPath, baseDir);
    if (!dirPath) { res.status(400).json({ error: "Invalid path" }); return; }
    if (!fs.existsSync(dirPath)) { res.status(404).json({ error: "Path not found" }); return; }
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) { res.status(400).json({ error: "Not a directory" }); return; }

    const entries = fs.readdirSync(dirPath);
    const items = entries
      .map((entry) => getFileInfo(path.join(dirPath, entry)))
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    res.json({ path: dirPath, items });
  } catch (err) {
    logger.error({ err }, "Failed to list files");
    res.status(500).json({ error: "Failed to list files" });
  }
});

router.get("/files/read", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.user?.username || "";
    const userId = req.user?.userId || "";
    await ensureUserIsolation(userId, username);
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: "Path required" }); return; }

    if (dockerManager.isAvailable) {
      const content = await dockerManager.execFileRead(username, filePath);
      if (content !== null) {
        const name = filePath.split("/").pop() || "";
        res.json({
          path: filePath,
          content,
          language: getLanguage(filePath),
          is_text: true,
          size: formatBytes(Buffer.byteLength(content, "utf8")),
        });
        return;
      }
    }

    const baseDir = getUserBaseDir(userId);
    const resolved = safePath(filePath, baseDir);
    if (!resolved) { res.status(400).json({ error: "Invalid path" }); return; }
    if (!fs.existsSync(resolved)) { res.status(404).json({ error: "File not found" }); return; }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) { res.status(400).json({ error: "Cannot read directory" }); return; }

    const isText = isTextFile(resolved);
    let content = "";
    if (isText) {
      try { content = fs.readFileSync(resolved, "utf8"); } catch { content = ""; }
    }
    res.json({ path: resolved, content, language: getLanguage(resolved), is_text: isText, size: formatBytes(stat.size) });
  } catch (err) {
    logger.error({ err }, "Failed to read file");
    res.status(500).json({ error: "Failed to read file" });
  }
});

router.post("/files/write", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.user?.username || "";
    const userId = req.user?.userId || "";
    await ensureUserIsolation(userId, username);
    const { path: filePath, content } = req.body;
    if (!filePath || content == null) {
      res.status(400).json({ success: false, message: "Path and content required" });
      return;
    }

    if (dockerManager.isAvailable) {
      const ok = await dockerManager.execFileWrite(username, filePath, content);
      if (ok) {
        res.json({ success: true, message: "File saved (isolated)" });
        return;
      }
    }

    const baseDir = getUserBaseDir(userId);
    const resolved = safePath(filePath, baseDir);
    if (!resolved) { res.status(400).json({ success: false, message: "Invalid path" }); return; }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, "utf8");
    res.json({ success: true, message: "File saved" });
  } catch (err) {
    logger.error({ err }, "Failed to write file");
    res.status(500).json({ success: false, message: "Failed to write file" });
  }
});

router.delete("/files/delete", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.user?.username || "";
    const userId = req.user?.userId || "";
    await ensureUserIsolation(userId, username);
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ success: false, message: "Path required" }); return; }

    if (dockerManager.isAvailable) {
      const ok = await dockerManager.execFileDelete(username, filePath);
      if (ok) {
        res.json({ success: true, message: "Deleted successfully (isolated)" });
        return;
      }
    }

    const baseDir = getUserBaseDir(userId);
    const resolved = safePath(filePath, baseDir);
    if (!resolved) { res.status(400).json({ success: false, message: "Invalid path" }); return; }
    if (!fs.existsSync(resolved)) { res.status(404).json({ success: false, message: "File not found" }); return; }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      fs.rmSync(resolved, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolved);
    }
    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    logger.error({ err }, "Failed to delete file");
    res.status(500).json({ success: false, message: "Failed to delete file" });
  }
});

router.post("/files/rename", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.user?.username || "";
    const userId = req.user?.userId || "";
    await ensureUserIsolation(userId, username);
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      res.status(400).json({ success: false, message: "oldPath and newPath required" });
      return;
    }

    if (dockerManager.isAvailable) {
      const ok = await dockerManager.execRename(username, oldPath, newPath);
      if (ok) {
        res.json({ success: true, message: "Renamed successfully (isolated)" });
        return;
      }
    }

    const baseDir = getUserBaseDir(userId);
    const resolvedOld = safePath(oldPath, baseDir);
    const resolvedNew = safePath(newPath, baseDir);
    if (!resolvedOld || !resolvedNew) { res.status(400).json({ success: false, message: "Invalid path" }); return; }
    if (!fs.existsSync(resolvedOld)) { res.status(404).json({ success: false, message: "Source not found" }); return; }
    fs.mkdirSync(path.dirname(resolvedNew), { recursive: true });
    fs.renameSync(resolvedOld, resolvedNew);
    res.json({ success: true, message: "Renamed successfully" });
  } catch (err) {
    logger.error({ err }, "Failed to rename file");
    res.status(500).json({ success: false, message: "Failed to rename file" });
  }
});

router.post("/files/mkdir", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.user?.username || "";
    const userId = req.user?.userId || "";
    await ensureUserIsolation(userId, username);
    const { path: dirPath } = req.body;
    if (!dirPath) { res.status(400).json({ success: false, message: "Path required" }); return; }

    if (dockerManager.isAvailable) {
      const ok = await dockerManager.execMkdir(username, dirPath);
      if (ok) {
        res.json({ success: true, message: "Directory created (isolated)" });
        return;
      }
    }

    const baseDir = getUserBaseDir(userId);
    const resolved = safePath(dirPath, baseDir);
    if (!resolved) { res.status(400).json({ success: false, message: "Invalid path" }); return; }
    fs.mkdirSync(resolved, { recursive: true });
    res.json({ success: true, message: "Directory created" });
  } catch (err) {
    logger.error({ err }, "Failed to create directory");
    res.status(500).json({ success: false, message: "Failed to create directory" });
  }
});

router.post("/files/upload", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.user?.username || "";
    const userId = req.user?.userId || "";
    await ensureUserIsolation(userId, username);
    const busboy = await import("busboy");
    let uploadPath = (req.headers["x-upload-path"] as string) || "/home/runner";

    const useDocker = dockerManager.isAvailable;
    let baseDir = "";

    if (!useDocker) {
      baseDir = getUserBaseDir(userId);
      const relative = uploadPath.replace(/^\/home\/runner\/?/, "") || ".";
      uploadPath = relative;
    }

    const bb = busboy.default({
      headers: req.headers,
      limits: { fileSize: 50 * 1024 * 1024, files: 10 },
    });
    let pendingWrites = 0;
    let uploadError: string | null = null;

    const checkDone = () => {
      if (pendingWrites === 0) {
        if (uploadError) {
          res.status(400).json({ success: false, message: uploadError });
        } else {
          res.json({ success: true, message: "File uploaded" });
        }
      }
    };

    bb.on("file", (_name, file, info) => {
      const { filename } = info;
      const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
      pendingWrites++;

      if (useDocker) {
        const containerName = `sh-user-${username.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase()}`;
        const tmpDest = path.join("/tmp", `sh-upload-${Date.now()}-${safeFilename}`);
        const ws = fs.createWriteStream(tmpDest);
        file.pipe(ws);
        ws.on("close", async () => {
          try {
            const containerDest = `${uploadPath}/${safeFilename}`;
            await dockerManager.execInContainer(username, ["mkdir", "-p", uploadPath]);
            execSync(`docker cp "${tmpDest}" "${containerName}:${containerDest}"`, {
              timeout: 30000, windowsHide: true,
            });
            fs.unlinkSync(tmpDest);
          } catch (err: any) {
            uploadError = err.message;
            try { fs.unlinkSync(tmpDest); } catch {}
          } finally {
            pendingWrites--;
            checkDone();
          }
        });
        ws.on("error", () => {
          uploadError = "Failed to write upload";
          pendingWrites--;
          checkDone();
        });
      } else {
        const safeDir = safePath(uploadPath, baseDir);
        if (!safeDir) { uploadError = "Invalid upload path"; pendingWrites--; checkDone(); return; }
        const dest = path.join(safeDir, safeFilename);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const ws = fs.createWriteStream(dest);
        file.pipe(ws);
        ws.on("close", () => {
          pendingWrites--;
          checkDone();
        });
        ws.on("error", () => {
          uploadError = "Failed to write upload";
          pendingWrites--;
          checkDone();
        });
      }
    });

    bb.on("error", (err: Error) => {
      uploadError = err.message;
      if (pendingWrites === 0) {
        res.status(400).json({ success: false, message: uploadError });
      }
    });

    bb.on("finish", () => {
      if (pendingWrites === 0) {
        checkDone();
      }
    });

    req.pipe(bb);
  } catch (err) {
    logger.error({ err }, "Failed to upload file");
    res.status(500).json({ success: false, message: "Failed to upload file" });
  }
});

router.get("/files/search", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.user?.username || "";
    const userId = req.user?.userId || "";
    await ensureUserIsolation(userId, username);
    const q = req.query.q as string;
    const searchPath = (req.query.path as string) || "/home/runner";
    if (!q) { res.status(400).json({ error: "Query required" }); return; }

    if (dockerManager.isAvailable) {
      const items = await dockerManager.execFileSearch(username, q, searchPath);
      res.json(items);
      return;
    }

    const baseDir = getUserBaseDir(userId);
    const resolved = safePath(searchPath, baseDir);
    if (!resolved || !fs.existsSync(resolved)) { res.json([]); return; }

    const results: ReturnType<typeof getFileInfo>[] = [];
    const qLower = q.toLowerCase();

    function walkDir(dir: string, depth = 0) {
      if (depth > 5 || results.length >= 50) return;
      let entries: string[] = [];
      try { entries = fs.readdirSync(dir); } catch { return; }
      for (const entry of entries) {
        if (entry.startsWith(".") && depth > 0) continue;
        const full = path.join(dir, entry);
        if (entry.toLowerCase().includes(qLower)) {
          const info = getFileInfo(full);
          if (info) results.push(info);
        }
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) walkDir(full, depth + 1);
        } catch {}
      }
    }

    walkDir(resolved);
    res.json(results.filter(Boolean));
  } catch (err) {
    logger.error({ err }, "Failed to search files");
    res.status(500).json({ error: "Search failed" });
  }
});

router.post("/files/extract", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const username = req.user?.username || "";
    const userId = req.user?.userId || "";
    await ensureUserIsolation(userId, username);
    const { path: archivePath, dest } = req.body;
    if (!archivePath) { res.status(400).json({ success: false, message: "Path required" }); return; }

    if (dockerManager.isAvailable) {
      const ok = await dockerManager.execExtract(username, archivePath, dest);
      if (ok) {
        res.json({ success: true, files: [] });
        return;
      }
    }

    const baseDir = getUserBaseDir(userId);
    const resolved = safePath(archivePath, baseDir);
    if (!resolved) { res.status(400).json({ success: false, message: "Invalid path" }); return; }
    if (!fs.existsSync(resolved)) { res.status(404).json({ success: false, message: "Archive not found" }); return; }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) { res.status(400).json({ success: false, message: "Path is a directory" }); return; }

    const ext = path.extname(resolved).toLowerCase();
    const baseName = path.basename(resolved);
    const extractDir = dest ? (safePath(dest, baseDir) || path.dirname(resolved)) : path.dirname(resolved);
    fs.mkdirSync(extractDir, { recursive: true });

    const isTarGz = baseName.endsWith(".tar.gz") || baseName.endsWith(".tgz");
    const isTar = ext === ".tar" || baseName.endsWith(".tar.");
    const isZip = ext === ".zip";

    if (!isTarGz && !isTar && !isZip) {
      res.status(400).json({ success: false, message: "Unsupported archive format" });
      return;
    }

    if (isZip) {
      const psScript = `Expand-Archive -Path '${resolved}' -DestinationPath '${extractDir}' -Force`;
      await execFileAsync("powershell", ["-NoProfile", "-Command", psScript]);
    } else if (isTarGz) {
      await execFileAsync("tar", ["-xzf", resolved, "-C", extractDir]);
    } else if (isTar) {
      await execFileAsync("tar", ["-xf", resolved, "-C", extractDir]);
    }

    res.json({ success: true, files: [] });
  } catch (err: any) {
    logger.error({ err }, "Failed to extract archive");
    res.status(500).json({ success: false, message: err.message || "Failed to extract archive" });
  }
});

export default router;
