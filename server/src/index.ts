import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { extractFile, extractUrl, truncate, type ExtractedInput } from "./extract.js";
import {
  analyzeInputs,
  extractJsonObject,
  listModels,
  ollamaRunning,
  normalizeAnalysis,
  killActiveProcess,
  DEFAULT_MODEL,
} from "./ai.js";
import { SAMPLE_PACK } from "./samples.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", async (_req, res) => {
  const running = await ollamaRunning();
  const models = await listModels();
  res.json({
    status: running ? "ok" : "degraded",
    ollama: running,
    models: models.map((m) => m.name),
    defaultModel: DEFAULT_MODEL,
  });
});

app.get("/api/samples", (_req, res) => {
  res.json({ pack: SAMPLE_PACK.map((s) => ({ type: s.type, name: s.name, contentType: s.contentType })) });
});

app.get("/api/samples/full", (_req, res) => {
  res.json({ pack: SAMPLE_PACK });
});

app.post("/api/extract-url", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "A valid http(s) URL is required." });
  }
  try {
    const input = await extractUrl(url);
    res.json(input);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to fetch URL" });
  }
});

app.post("/api/analyze", upload.array("files"), async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const controller = new AbortController();
  let clientGone = false;

  const cleanup = () => {
    clientGone = true;
    controller.abort();
    killActiveProcess();
  };

  res.on("close", cleanup);

  const MAX_SSE_PAYLOAD = 64_000;

  const safeWrite = (type: string, data: Record<string, unknown>): boolean => {
    if (clientGone || res.writableEnded) return false;
    try {
      const payload = JSON.stringify({ type, ...data });
      if (payload.length > MAX_SSE_PAYLOAD) {
        const chunkSize = MAX_SSE_PAYLOAD;
        for (let i = 0; i < payload.length; i += chunkSize) {
          if (clientGone || res.writableEnded) return false;
          const slice = payload.slice(i, i + chunkSize);
          const isLast = i + chunkSize >= payload.length;
          const event = isLast
            ? `data: ${JSON.stringify({ type: "chunk", id: type, final: true, data: slice })}\n\n`
            : `data: ${JSON.stringify({ type: "chunk", id: type, final: false, data: slice })}\n\n`;
          res.write(event);
        }
        return true;
      }
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      return true;
    } catch {
      clientGone = true;
      controller.abort();
      return false;
    }
  };

  const fields = req.body ?? {};
  const model = (fields.model as string) || "";
  if (!model) {
    safeWrite("error", { message: "No model selected. Please choose an AI model before running analysis." });
    res.end();
    return;
  }
  let textInputs: ExtractedInput[] = [];
  try {
    if (typeof fields.inputs === "string") textInputs = JSON.parse(fields.inputs) as ExtractedInput[];
    else if (Array.isArray(fields.inputs)) textInputs = fields.inputs as ExtractedInput[];
  } catch {
    textInputs = [];
  }
  const files = (req.files as Express.Multer.File[]) ?? [];

  try {
    const sources: ExtractedInput[] = [...textInputs];

    safeWrite("progress", { message: `Reading ${files.length} uploaded file(s)…` });
    for (const f of files) {
      if (clientGone) break;
      try {
        const input = await extractFile(f.buffer, f.originalname, f.mimetype);
        sources.push(input);
      } catch (err) {
        safeWrite("warn", {
          message: `Could not read "${f.originalname}": ${err instanceof Error ? err.message : "unknown error"}`,
        });
      }
    }

    if (clientGone) return;

    const readable = sources.filter((s) => s.content.trim().length > 0);
    if (readable.length === 0) {
      throw new Error("No readable content was provided. Add files, text, a URL, or load the sample pack.");
    }

    safeWrite("progress", { message: `Analysing ${readable.length} input(s) with ${model}…` });
    const raw = await analyzeInputs(
      readable.map((s) => ({ name: s.name, type: s.type, content: truncate(s.content) })),
      model,
      (msg) => safeWrite("progress", { message: msg }),
      controller.signal,
    );

    if (clientGone) return;

    safeWrite("progress", { message: "Validating the model output…" });
    const parsed = extractJsonObject(raw) as Record<string, unknown>;
    const normalized = normalizeAnalysis(parsed);

    safeWrite("result", {
      model,
      inputs: readable.map((s) => ({ name: s.name, type: s.type, chars: s.content.length })),
      analysis: normalized,
    });
  } catch (err) {
    if (clientGone || controller.signal.aborted) return;
    const msg = err instanceof Error ? err.message : "Unexpected analysis failure";
    safeWrite("error", { message: msg });
  } finally {
    killActiveProcess();
    if (!res.writableEnded && !clientGone) {
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`[bizdiscovery] API listening on http://localhost:${port}`);
  console.log(`[bizdiscovery] default Ollama model: ${DEFAULT_MODEL}`);
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ error: `Invalid request: ${err.message}` });
});
