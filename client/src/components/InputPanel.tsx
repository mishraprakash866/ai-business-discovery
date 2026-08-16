import { useRef, useState } from "react";
import type { ClientInput } from "../types";

const KIND_ICON: Record<ClientInput["kind"], string> = {
  file: "📄",
  text: "✍️",
  url: "🌐",
};

const KIND_LABEL: Record<ClientInput["kind"], string> = {
  file: "File",
  text: "Pasted text",
  url: "Website",
};

function fmtSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  inputs: ClientInput[];
  model: string;
  models: string[];
  onModelChange: (m: string) => void;
  onAddText: (content: string) => void;
  onAddFiles: (files: File[]) => void;
  onAddUrl: (url: string) => Promise<void>;
  onRemove: (id: string) => void;
  onClear: () => void;
  onLoadSamples: () => Promise<void>;
  onAnalyze: () => void;
  analyzing: boolean;
  log: { kind: "progress" | "warn" | "error"; text: string }[];
}

export default function InputPanel({
  inputs,
  model,
  models,
  onModelChange,
  onAddText,
  onAddFiles,
  onAddUrl,
  onRemove,
  onClear,
  onLoadSamples,
  onAnalyze,
  analyzing,
  log,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"files" | "text" | "url" | null>(
    null,
  );
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState("");

  const submitText = () => {
    if (text.trim().length < 10) return;
    onAddText(text.trim());
    setText("");
    setActiveTab(null);
  };

  const submitUrl = async () => {
    if (!/^https?:\/\//i.test(url.trim())) {
      setUrlError("Enter a full http(s) URL.");
      return;
    }
    setUrlBusy(true);
    setUrlError("");
    try {
      await onAddUrl(url.trim());
      setUrl("");
      setActiveTab(null);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Failed to fetch URL");
    } finally {
      setUrlBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Client inputs</h2>
        <span className="count">{inputs.length}</span>
      </div>

      <div className="add-actions">
        <button
          className={`btn ${activeTab === "files" ? "active" : ""}`}
          onClick={() =>
            setActiveTab((prev) => (prev === "files" ? null : "files"))
          }
          disabled={analyzing}
        >
          Upload files
        </button>
        <button
          className={`btn ${activeTab === "text" ? "active" : ""}`}
          onClick={() =>
            setActiveTab((prev) => (prev === "text" ? null : "text"))
          }
          disabled={analyzing}
        >
          Paste text
        </button>
        <button
          className={`btn ${activeTab === "url" ? "active" : ""}`}
          onClick={() =>
            setActiveTab((prev) => (prev === "url" ? null : "url"))
          }
          disabled={analyzing}
        >
          Add website
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.md,.csv,.json,.log,.html,.rtf,image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onAddFiles(files);
          e.target.value = "";
          setActiveTab(null);
        }}
      />

      {activeTab === "files" && (
        <div className="inline-form">
          <p className="sample-hint">
            Select one or more files from your computer — PDF, DOCX, TXT, MD,
            HTML, or images.
          </p>
          <div className="inline-actions">
            <button
              className="btn primary"
              onClick={() => fileRef.current?.click()}
            >
              Choose files…
            </button>
            <button className="btn" onClick={() => setActiveTab(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeTab === "text" && (
        <div className="inline-form">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Paste a meeting transcript, call notes, or any free-text input here…"
          />
          <div className="inline-actions">
            <button
              className="btn primary"
              onClick={submitText}
              disabled={text.trim().length < 10}
            >
              Add text
            </button>
            <button className="btn" onClick={() => setActiveTab(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeTab === "url" && (
        <div className="inline-form">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/current-app"
            onKeyDown={(e) => e.key === "Enter" && submitUrl()}
          />
          {urlError && <p className="form-error">{urlError}</p>}
          <div className="inline-actions">
            <button
              className="btn primary"
              onClick={submitUrl}
              disabled={urlBusy}
            >
              {urlBusy ? "Fetching…" : "Fetch & add"}
            </button>
            <button className="btn" onClick={() => setActiveTab(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        className="btn samples"
        onClick={onLoadSamples}
        disabled={analyzing}
        title="Load a ready-made example: two meeting transcripts, a WhatsApp chat export, and a process document"
      >
        🎲 Load sample client pack
      </button>

      <div className="input-list">
        {inputs.length === 0 && (
          <p className="empty-hint">
            No inputs yet. Add files, paste text, add a website, or load the
            sample pack.
          </p>
        )}
        {inputs.map((i) => (
          <div className="input-card" key={i.id}>
            <span className="kind-icon">{KIND_ICON[i.kind]}</span>
            <div className="input-meta">
              <div className="input-name" title={i.name}>
                {i.name}
              </div>
              <div className="input-sub">
                <span className="badge">{KIND_LABEL[i.kind]}</span>
                <span>{fmtSize(i.size)}</span>
                <span className={i.content === undefined ? "warn-text" : ""}>
                  {i.content === undefined
                    ? "to be read server-side"
                    : `${i.content.length.toLocaleString()} chars`}
                </span>
              </div>
            </div>
            <button
              className="remove"
              onClick={() => onRemove(i.id)}
              disabled={analyzing}
              aria-label="Remove input"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {inputs.length > 0 && (
        <button className="btn subtle" onClick={onClear} disabled={analyzing}>
          Clear all inputs
        </button>
      )}

      <div className="model-row">
        <label htmlFor="model">AI model</label>
        <select
          id="model"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={analyzing}
        >
          {models.length === 0 && <option value={model}>{model}</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <button
        className="btn analyze"
        onClick={onAnalyze}
        disabled={analyzing || inputs.length === 0}
      >
        {analyzing ? "Analysing…" : "Run analysis →"}
      </button>

      {log.length > 0 && (
        <div className="log">
          {log.map((l, i) => (
            <div key={i} className={`log-line ${l.kind}`}>
              <span className="log-dot" /> {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
