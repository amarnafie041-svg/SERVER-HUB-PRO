import { Router, type IRouter } from "express";
import { Request, Response } from "express";
import * as https from "https";
import * as http from "http";
import * as querystring from "querystring";
import { logger } from "../lib/logger";
import { authenticate } from "../middleware/authenticate";

const router: IRouter = Router();

const MODELS: Record<string, { x: string; name: string }> = {
  "gemini-flash": { x: '[1,null,null,null,"35609594dbe934d8"]', name: "Gemini 3.5 Flash" },
  "gemini-deep": { x: '[1,null,null,null,"cd472a54d2abba7e"]', name: "Gemini Deep Research" },
};

const BASE_URL = "https://gemini.google.com";
const API_PATH = "/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";
const BOQ_VERSION = "boq_assistant-bard-web-server_20240519.16_p0";

let cookieJar = "";
let conversationId: string | null = null;
let responseId: string | null = null;
let choiceId: string | null = null;

function httpsGet(url: string): Promise<{ body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts: https.RequestOptions = {
      hostname: u.hostname, path: u.pathname + u.search, method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 15000,
    };
    if (cookieJar) opts.headers = { ...opts.headers, Cookie: cookieJar };
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const setCook = res.headers["set-cookie"];
        if (setCook) {
          const parsed = (Array.isArray(setCook) ? setCook : [setCook])
            .map((c: string) => c.split(";")[0]).join("; ");
          if (parsed) cookieJar = parsed;
        }
        resolve({ body: Buffer.concat(chunks).toString(), headers: res.headers });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("GET timed out")); });
    req.end();
  });
}

function httpsPost(url: string, data: string, xHeader: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const buf = Buffer.from(data, "utf-8");
    const opts: https.RequestOptions = {
      hostname: u.hostname, path: u.pathname + u.search, method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Content-Length": buf.length,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://gemini.google.com",
        Referer: "https://gemini.google.com/",
        "x-same-domain": "1",
        "x-goog-ext-525001261-jspb": xHeader,
      },
      timeout: 60000,
    };
    if (cookieJar) opts.headers = { ...opts.headers, Cookie: cookieJar };
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const setCook = res.headers["set-cookie"];
        if (setCook) {
          const parsed = (Array.isArray(setCook) ? setCook : [setCook])
            .map((c: string) => c.split(";")[0]).join("; ");
          if (parsed) cookieJar = parsed;
        }
        resolve(Buffer.concat(chunks).toString());
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("POST timed out")); });
    req.write(buf);
    req.end();
  });
}

function extractFdrToken(html: string): string | null {
  const m = html.match(/"FdrFJe":"([\d-]+)"/);
  return m ? m[1] : null;
}

function parseGeminiResponse(raw: string): string | null {
  const lines = raw.split("\n");
  let fullText = "";
  for (const line of lines) {
    if (!line || line.startsWith(")]}'")) continue;
    try {
      const arr = JSON.parse(line);
      if (!Array.isArray(arr) || arr.length < 1) continue;
      const item = arr[0];
      if (!Array.isArray(item) || item.length < 3) continue;
      const innerStr = item[2];
      if (typeof innerStr !== "string") continue;
      const inner = JSON.parse(innerStr);
      if (!Array.isArray(inner) || inner.length < 5) continue;

      if (inner[1] && Array.isArray(inner[1]) && inner[1].length >= 2) {
        conversationId = inner[1][0];
        responseId = inner[1][1];
        if (inner[1].length >= 3) choiceId = inner[1][2];
      }

      if (inner[4] && Array.isArray(inner[4]) && inner[4].length > 0) {
        const firstResp = inner[4][0];
        if (Array.isArray(firstResp) && firstResp.length > 1) {
          const textList = firstResp[1];
          if (Array.isArray(textList) && textList.length > 0) {
            const text = textList[0];
            if (typeof text === "string" && text.length > fullText.length) {
              fullText = text;
            }
          }
        }
      }
    } catch {}
  }
  return fullText || null;
}

router.get("/ai/settings", async (_req: Request, res: Response): Promise<void> => {
  res.json({ has_key: true });
});

router.put("/ai/settings", async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true });
});

router.get("/ai/ping", async (_req: Request, res: Response): Promise<void> => {
  res.json({ ok: true, has_key: true, models: Object.keys(MODELS) });
});

router.post("/ai/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, model: modelKey, stream: doStream } = req.body;
    logger.info({ model: modelKey, has_msg: !!message, stream: doStream }, "AI chat request");

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Message required" }); return;
    }

    const modelCfg = MODELS[modelKey] || MODELS["gemini-flash"];

    // Get FdrFJe token from Gemini homepage
    const { body: html } = await httpsGet(BASE_URL);
    const fdrToken = extractFdrToken(html);
    if (!fdrToken) {
      res.status(502).json({ error: "Failed to get Gemini token", content: "", model: modelCfg.name });
      return;
    }

    const reqData = [
      [message, 0, null, [], null, null, 0],
      ["en"],
      [null, null, null, null, null, []],
      null, null, null, [], 0, [], [], 1, 0,
    ];
    if (conversationId && responseId) {
      const ctx: any[] = [conversationId, responseId];
      if (choiceId) ctx.push(choiceId);
      reqData[2] = ctx;
    }

    const payload = querystring.stringify({
      at: "dummy",
      "f.req": JSON.stringify([null, JSON.stringify(reqData)]),
    });

    const params = querystring.stringify({
      bl: BOQ_VERSION, hl: "en",
      _reqid: String(Math.floor(Math.random() * 90000) + 10000),
      rt: "c", "f.sid": fdrToken,
    });

    const apiUrl = `${BASE_URL}${API_PATH}?${params}`;
    const raw = await httpsPost(apiUrl, payload, modelCfg.x);
    const content = parseGeminiResponse(raw);

    if (!content) {
      res.status(502).json({ error: "No response from Gemini", content: "", model: modelCfg.name });
      return;
    }

    res.json({ content, model: modelCfg.name });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const safeLog = `AI error: ${msg.slice(0, 500)}`;
    try { logger.error({ err: safeLog }, "AI chat failed"); } catch { console.error(safeLog); }
    try {
      res.status(500).json({ error: safeLog, content: "", model: "unknown" });
    } catch {}
  }
});

router.post("/ai/analyze", async (req: Request, res: Response): Promise<void> => {
  try {
    const { path: filePath, question } = req.body;
    if (!filePath || !question) {
      res.status(400).json({ error: "Path and question required" }); return;
    }
    let fileContent = "";
    try {
      fileContent = require("fs").readFileSync(filePath, "utf8").slice(0, 8000);
    } catch {
      res.status(404).json({ error: "File not found or unreadable" }); return;
    }
    // Reuse chat endpoint internally
    const prompt = `Analyze this file (${filePath}):\n\n\`\`\`\n${fileContent}\n\`\`\`\n\n${question}`;
    const { body: html } = await httpsGet(BASE_URL);
    const fdrToken = extractFdrToken(html);
    if (!fdrToken) { res.status(502).json({ error: "Failed to get Gemini token", content: "", model: "Gemini" }); return; }

    const reqData = [[prompt, 0, null, [], null, null, 0], ["en"], [null, null, null, null, null, []], null, null, null, [], 0, [], [], 1, 0];
    const payload = querystring.stringify({ at: "dummy", "f.req": JSON.stringify([null, JSON.stringify(reqData)]) });
    const params = querystring.stringify({ bl: BOQ_VERSION, hl: "en", _reqid: String(Math.floor(Math.random() * 90000) + 10000), rt: "c", "f.sid": fdrToken });
    const raw = await httpsPost(`${BASE_URL}${API_PATH}?${params}`, payload, MODELS["gemini-flash"].x);
    const content = parseGeminiResponse(raw);
    res.json({ content: content || "No response", model: "Gemini 3.5 Flash" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try { logger.error({ err: msg }, "Analyze failed"); } catch {}
    res.status(500).json({ error: msg, content: "", model: "unknown" });
  }
});

export default router;