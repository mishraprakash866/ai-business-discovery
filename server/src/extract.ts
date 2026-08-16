import { readFile } from "node:fs/promises";
import * as cheerio from "cheerio";

const ALLOWED_TEXT_EXT = [".txt", ".md", ".csv", ".json", ".log", ".html", ".htm", ".xml", ".rtf"];

export interface ExtractedInput {
  type: "file" | "text" | "url";
  name: string;
  contentType: string;
  content: string;
}

export async function extractFile(buffer: Buffer, originalName: string, contentType: string): Promise<ExtractedInput> {
  const ext = (originalName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  const name = originalName;

  if (ext === "pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = (await import("pdf-parse")).default as unknown as (buf: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return { type: "file", name, contentType, content: parsed.text.trim() };
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { type: "file", name, contentType, content: result.value.trim() };
  }

  if (ALLOWED_TEXT_EXT.includes(`.${ext}`)) {
    const text = buffer.toString("utf-8").trim();
    return { type: "file", name, contentType, content: text };
  }

  if (["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(ext)) {
    return {
      type: "file",
      name,
      contentType,
      content: `[Screenshot/image uploaded: "${name}" (${contentType || ext}). No OCR model is available locally, so the visual content could not be read. It is listed as an input source; its content should be treated as missing/unreadable information.]`,
    };
  }

  // Unknown type: still keep it as a placeholder so nothing silently drops.
  const text = buffer.toString("utf-8").trim().slice(0, 5000);
  return {
    type: "file",
    name,
    contentType: contentType || "unknown",
    content: text || `[File "${name}" uploaded but its content could not be decoded.]`,
  };
}

export async function extractUrl(url: string): Promise<ExtractedInput> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "BizDiscovery-POC/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${url}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, noscript, svg, header, footer, nav").remove();
    const title = $("title").first().text().trim() || url;
    const body = $("body");
    const text = body.text().replace(/\s+/g, " ").trim();
    const content = `Website: ${title}\nURL: ${url}\n\n${text.slice(0, 20000)}`;
    return { type: "url", name: title || url, contentType: "text/html", content };
  } finally {
    clearTimeout(timer);
  }
}

export function truncate(content: string, max = 12000): string {
  if (content.length <= max) return content;
  return content.slice(0, max) + `\n...[truncated, original length ${content.length} chars]`;
}
