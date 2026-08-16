import type { AnalysisResult, ClientInput } from "./types";

export interface HealthInfo {
  status: string;
  ollama: boolean;
  models: string[];
  defaultModel: string;
}

export async function getHealth(): Promise<HealthInfo> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("API is not reachable");
  return res.json();
}

export interface SampleMeta {
  type: string;
  name: string;
  contentType: string;
}

export async function getSamples(): Promise<{ type: string; name: string; contentType: string; content: string }[]> {
  const res = await fetch("/api/samples/full");
  if (!res.ok) throw new Error("Failed to load samples");
  return (await res.json()).pack;
}

export async function fetchUrl(url: string): Promise<{ name: string; contentType: string; content: string }> {
  const res = await fetch("/api/extract-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch URL");
  return data;
}

export type StreamEvent =
  | { type: "progress"; message: string }
  | { type: "warn"; message: string }
  | (AnalysisResult & { type: "result" })
  | { type: "error"; message: string };

export async function analyze(
  inputs: ClientInput[],
  model: string,
  onEvent: (ev: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const textLike = inputs.filter((i) => i.content !== undefined);
  const files = inputs.filter((i) => i.file !== undefined);

  let res: Response;
  try {
    if (files.length > 0) {
      const fd = new FormData();
      for (const f of files) fd.append("files", f.file as Blob, f.name);
      fd.append("model", model);
      fd.append(
        "inputs",
        JSON.stringify(
          textLike.map((i) => ({ type: i.kind, name: i.name, contentType: i.contentType, content: i.content })),
        ),
      );
      res = await fetch("/api/analyze", { method: "POST", body: fd, signal });
    } else {
      res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          inputs: textLike.map((i) => ({ type: i.kind, name: i.name, contentType: i.contentType, content: i.content })),
        }),
        signal,
      });
    }
  } catch (err) {
    if (signal?.aborted) {
      onEvent({ type: "error", message: "Analysis was cancelled." });
      return;
    }
    onEvent({ type: "error", message: err instanceof Error ? err.message : "Network failure" });
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    onEvent({ type: "error", message: `Request failed (${res.status}): ${text.slice(0, 300)}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const pendingChunks = new Map<string, string>();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        try {
          const raw = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
          if (raw.type === "chunk") {
            const chunkId = raw.id as string;
            const data = raw.data as string;
            const isFinal = raw.final === true;
            const existing = pendingChunks.get(chunkId) ?? "";
            pendingChunks.set(chunkId, existing + data);
            if (isFinal) {
              const assembled = pendingChunks.get(chunkId) ?? "";
              pendingChunks.delete(chunkId);
              const ev = JSON.parse(assembled) as StreamEvent;
              onEvent(ev);
              if (ev.type === "error") return;
            }
          } else {
            const ev = raw as StreamEvent;
            onEvent(ev);
            if (ev.type === "error") return;
          }
        } catch {
          // ignore partial lines
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      onEvent({ type: "error", message: "Analysis was cancelled." });
      return;
    }
    onEvent({ type: "error", message: err instanceof Error ? err.message : "Stream read error" });
  }
}
