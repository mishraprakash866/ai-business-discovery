const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "llama3:latest";

const MAX_RESPONSE_CHARS = 500_000;

let activeOllamaAbort: AbortController | null = null;

export function killActiveProcess(): void {
  if (activeOllamaAbort) {
    try {
      activeOllamaAbort.abort();
    } catch {
      // already aborted
    }
    activeOllamaAbort = null;
  }
}

export interface OllamaModel {
  name: string;
  size: number;
}

export async function listModels(): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: { name: string; size: number }[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

export async function ollamaRunning(): Promise<boolean> {
  const models = await listModels();
  return models.length > 0;
}

export const ANALYSIS_SCHEMA = {
  summary: "one-paragraph plain summary of what the client wants",
  business_goal: "what the client ultimately wants to achieve, in plain language",
  current_process: "array of strings: steps describing how the client works today",
  pain_points: "array of strings: problems, delays, manual work, errors, gaps in the current process",
  requirements: "array of strings: concrete, important requirements that must be in the solution",
  missing_information: "array of strings: anything unclear, missing, or contradictory in the provided inputs",
  improvements: "array of objects {problem, suggestion, impact}: what can be simplified/automated/improved and why it matters",
  solution: {
    name: "a short name for the proposed application",
    description: "two-to-three sentence description of the proposed application",
    features: "array of strings: the main features of the proposed application",
    roles: "array of strings: the user roles that would use the application",
    screens: "array of objects {name, description}: the main screens/modules of the application",
    flow: "array of objects {step, actor, action}: a simple numbered flow of how the application would be used end to end",
  },
  poc: {
    app_name: "short name of the clickable prototype",
    screens: "array of clickable prototype screens, each: {name, nav: array of screen names (same across all screens), blocks: array of UI blocks. A block is one of: {type:'header', label}, {type:'heading', label}, {type:'text', label}, {type:'list', label, items:[...]}, {type:'stats', label, items:[...]}, {type:'form', label, items:[field labels...]}, {type:'button', label}, {type:'card', label, meta, items:[...]}, {type:'status', label, meta}}",
  },
};

export function buildSystemPrompt(): string {
  return `You are a senior business consultant who turns scattered client information into a clear business requirement and a proposed application solution.

Read all the client inputs provided. They may be meeting transcripts, call notes, WhatsApp chats, PDFs, documents, screenshots descriptions, or a website reference. The inputs are messy, overlapping, and sometimes contradictory - that is normal.

Work through the material and produce a complete analysis in STRICT JSON. Follow the schema exactly. Use ONLY the schema keys. Every array field must be non-empty (use at least one meaningful item). Keep every string concise and practical - no marketing language. For the 'poc' section, design a realistic, minimal prototype: pick the 3-5 most important screens of the proposed application and describe each screen with concrete UI blocks (headings, lists, forms, buttons, stat cards, status) using realistic business content derived from the client's own words. The prototype should feel like a real screen of the proposed app.

Schema:
${JSON.stringify(ANALYSIS_SCHEMA, null, 2)}

Respond with the JSON object only. No markdown, no code fences, no commentary.`;
}

export async function analyzeInputs(
  sources: { name: string; type: string; content: string }[],
  model: string,
  onProgress: (msg: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new Error("Analysis was cancelled");

  const material = sources
    .map((s, i) => `--- SOURCE ${i + 1} (${s.type}: ${s.name}) ---\n${s.content}`)
    .join("\n\n");

  onProgress("Sending inputs to the local model…");

  const body = {
    model,
    stream: true,
    format: "json",
    options: { temperature: 0.4 },
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: `Here are the client inputs:\n\n${material}` },
    ],
  };

  const ollamaCtrl = new AbortController();
  activeOllamaAbort = ollamaCtrl;

  const merged = new AbortController();
  const onParentAbort = () => merged.abort();
  const onOllamaAbort = () => merged.abort();
  signal?.addEventListener("abort", onParentAbort, { once: true });
  ollamaCtrl.signal.addEventListener("abort", onOllamaAbort, { once: true });

  let firstTokenReceived = false;
  let elapsed = 0;
  let full = "";

  const heartbeat = setInterval(() => {
    if (merged.signal.aborted) return;
    elapsed += 5;
    if (!firstTokenReceived) {
      onProgress(`Waiting for model to respond… (${elapsed}s)`);
    } else {
      onProgress(`Model is generating… ${full.length} chars so far (${elapsed}s)`);
    }
  }, 5000);

  const cleanup = () => {
    clearInterval(heartbeat);
    signal?.removeEventListener("abort", onParentAbort);
    ollamaCtrl.signal.removeEventListener("abort", onOllamaAbort);
    activeOllamaAbort = null;
  };

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: merged.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama returned HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
    }
    if (!res.body) throw new Error("No response body from Ollama");

    onProgress("Model is analysing…");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false;

    try {
      while (!done) {
        if (merged.signal.aborted) {
          reader.cancel().catch(() => {});
          throw new Error("Analysis was cancelled");
        }
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          if (!firstTokenReceived) {
            firstTokenReceived = true;
            onProgress("First tokens received — generating response…");
          }
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("{")) continue;
            try {
              const parsed = JSON.parse(trimmed) as { message?: { content?: string } };
              if (parsed.message?.content) full += parsed.message.content;
            } catch {
              // partial JSON line, skip
            }
          }
        }
        if (full.length > MAX_RESPONSE_CHARS) {
          reader.cancel().catch(() => {});
          ollamaCtrl.abort();
          throw new Error(`Response exceeded ${MAX_RESPONSE_CHARS} characters — aborting to prevent memory exhaustion`);
        }
      }
    } catch (err) {
      if (merged.signal.aborted) throw new Error("Analysis was cancelled");
      throw err;
    }

    onProgress("Structuring the results…");
    return full;
  } finally {
    cleanup();
  }
}

export function extractJsonObject(text: string): unknown {
  // Remove markdown fences if present.
  let cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim().length > 0) : [];
}

/**
 * Normalize the model's raw output so every downstream consumer can rely on
 * the shape. Local models are not 100% schema-faithful, so we fill gaps and
 * rebuild a minimal but complete POC from the solution outline when needed.
 */
export function normalizeAnalysis(raw: Record<string, unknown>): Record<string, unknown> {
  const solutionRaw = (raw.solution && typeof raw.solution === "object" ? raw.solution : {}) as Record<string, unknown>;
  const screens = asArrayOf(
    solutionRaw.screens,
    (s) => typeof s === "object" && s !== null && typeof (s as { name?: unknown }).name === "string",
  ).map((s) => {
    const o = s as Record<string, unknown>;
    return { name: String(o.name), description: typeof o.description === "string" ? o.description : "" };
  });

  const solution = {
    name: typeof solutionRaw.name === "string" ? solutionRaw.name : "Proposed application",
    description:
      typeof solutionRaw.description === "string"
        ? solutionRaw.description
        : "A proposed application that addresses the client's business need.",
    features: asStringArray(solutionRaw.features),
    roles: asStringArray(solutionRaw.roles),
    screens,
    flow: asArrayOf(
      solutionRaw.flow,
      (f) => typeof f === "object" && f !== null,
    ).map((f) => {
      const o = f as Record<string, unknown>;
      return {
        step: o.step ?? o.stepNumber ?? "Step",
        actor: typeof o.actor === "string" ? o.actor : "User",
        action: typeof o.action === "string" ? o.action : "",
      };
    }),
  };
  if (solution.features.length === 0) solution.features = ["Core workflow support"];
  if (solution.roles.length === 0) solution.roles = ["Primary user"];
  if (solution.screens.length === 0) solution.screens = [{ name: "Main screen", description: "Primary workspace" }];
  if (solution.flow.length === 0)
    solution.flow = [{ step: 1, actor: "User", action: "Use the proposed application for the core workflow" }];

  const pocRaw = (raw.poc && typeof raw.poc === "object" ? raw.poc : {}) as Record<string, unknown>;
  interface PocScreenT {
    name: string;
    nav: string[];
    blocks: { type: string; label: string; meta?: string; items?: unknown[] }[];
  }
  let pocScreens: PocScreenT[] = asArrayOf(pocRaw.screens, (s) => typeof s === "object" && s !== null).map((s) => {
    const o = s as Record<string, unknown>;
    return {
      name: typeof o.name === "string" && o.name.trim() ? o.name : "Screen",
      nav: asStringArray(o.nav),
      blocks: asArrayOf(o.blocks, (b) => typeof b === "object" && b !== null).map((b) => {
        const blk = b as Record<string, unknown>;
        return {
          type: typeof blk.type === "string" ? blk.type : "text",
          label: typeof blk.label === "string" ? blk.label : "",
          meta: typeof blk.meta === "string" ? blk.meta : undefined,
          items: Array.isArray(blk.items) ? blk.items : undefined,
        };
      }),
    };
  });

  if (pocScreens.length === 0) {
    // Fallback: turn the solution outline screens into simple prototype screens.
    const nav = solution.screens.map((s) => s.name);
    const fallbackBlocks: { type: string; label: string; meta?: string; items?: unknown[] }[] = [
      { type: "header", label: solution.name, meta: solution.description },
      { type: "heading", label: "Overview" },
      { type: "list", label: "Key features", items: solution.features },
      { type: "status", label: "Prototype ready", meta: "ok" },
    ];
    pocScreens = solution.screens.map((s, i) => ({
      name: s.name,
      nav,
      blocks:
        i === 0
          ? fallbackBlocks
          : [
              { type: "header", label: solution.name },
              { type: "heading", label: s.name },
              { type: "text", label: s.description || "Coming soon" },
            ],
    }));
  }

  const poc = {
    app_name: typeof pocRaw.app_name === "string" && pocRaw.app_name.trim() ? pocRaw.app_name : solution.name,
    screens: pocScreens,
  };

  return {
    summary: typeof raw.summary === "string" ? raw.summary : "Summary unavailable.",
    business_goal: typeof raw.business_goal === "string" ? raw.business_goal : "Goal not clearly stated in the inputs.",
    current_process: asStringArray(raw.current_process),
    pain_points: asStringArray(raw.pain_points),
    requirements: asStringArray(raw.requirements),
    missing_information: asStringArray(raw.missing_information),
    improvements: asArrayOf(raw.improvements, (x) => typeof x === "object" && x !== null).map((x) => {
      const o = x as Record<string, unknown>;
      return {
        problem: typeof o.problem === "string" ? o.problem : "Unclear",
        suggestion: typeof o.suggestion === "string" ? o.suggestion : "",
        impact: typeof o.impact === "string" ? o.impact : "",
      };
    }),
    solution,
    poc,
  };
}

function asArrayOf(v: unknown, guard: (x: unknown) => boolean): unknown[] {
  return Array.isArray(v) ? v.filter(guard) : [];
}
