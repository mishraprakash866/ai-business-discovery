import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult, ClientInput } from "./types";
import {
  analyze,
  fetchUrl,
  getHealth,
  getSamples,
  type HealthInfo,
} from "./api";
import InputPanel from "./components/InputPanel";
import Results from "./components/Results";

let idCounter = 0;
const nextId = () => `in-${++idCounter}-${Date.now()}`;

type Phase = "idle" | "analyzing" | "done" | "error";

export default function App() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [inputs, setInputs] = useState<ClientInput[]>([]);
  const [model, setModel] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [log, setLog] = useState<
    { kind: "progress" | "warn" | "error"; text: string }[]
  >([]);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        if (h.models.length > 0) {
          if (!model || !h.models.includes(model)) {
            setModel(h.models[0]);
          }
        } else {
          setModel("");
        }
      })
      .catch(() =>
        setHealth({
          status: "down",
          ollama: false,
          models: [],
          defaultModel: "",
        }),
      );
  }, []);

  const addInput = useCallback((input: ClientInput) => {
    setInputs((prev) => [...prev, input]);
  }, []);

  const removeInput = useCallback((id: string) => {
    setInputs((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearAll = useCallback(() => setInputs([]), []);

  const loadSamples = useCallback(async () => {
    try {
      const pack = await getSamples();
      const loaded: ClientInput[] = pack.map((s) => ({
        id: nextId(),
        kind: s.type as ClientInput["kind"],
        name: s.name,
        contentType: s.contentType,
        content: s.content,
        size: s.content.length,
      }));
      setInputs(loaded);
    } catch {
      setLog((l) => [
        ...l,
        { kind: "error", text: "Could not load the sample pack." },
      ]);
    }
  }, []);

  const addUrl = useCallback(
    async (url: string) => {
      const data = await fetchUrl(url);
      addInput({
        id: nextId(),
        kind: "url",
        name: data.name,
        contentType: data.contentType,
        content: data.content,
        size: data.content.length,
      });
    },
    [addInput],
  );

  const onAnalyze = useCallback(async () => {
    if (inputs.length === 0) return;
    if (!model) {
      setLog([{ kind: "error", text: "Please select an AI model before running analysis." }]);
      setPhase("error");
      return;
    }
    setPhase("analyzing");
    setResult(null);
    setLog([]);
    try {
      await analyze(inputs, model, (ev) => {
        if (ev.type === "result") {
          setResult(ev);
          setPhase("done");
          setTimeout(
            () =>
              resultRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              }),
            100,
          );
        } else if (ev.type === "error") {
          setLog((l) => [...l, { kind: "error", text: ev.message }]);
          setPhase("error");
        } else {
          setLog((l) => [
            ...l,
            {
              kind: ev.type === "warn" ? "warn" : "progress",
              text: ev.message,
            },
          ]);
        }
      });
    } catch (err) {
      setLog((l) => [
        ...l,
        {
          kind: "error",
          text: err instanceof Error ? err.message : "Network failure",
        },
      ]);
      setPhase("error");
    }
  }, [inputs, model]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">BD</div>
          <div>
            <h1>
              AI Business Discovery <span className="arrow">→</span> POC
            </h1>
          </div>
        </div>
        <div
          className={`health ${health?.ollama ? "ok" : "down"}`}
          title="Local Ollama connection"
        >
          <span className="dot" />{" "}
          {health?.ollama ? "Ollama connected" : "Ollama offline"}
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <InputPanel
            inputs={inputs}
            model={model}
            models={health?.models ?? []}
            onModelChange={setModel}
            onAddText={(content) =>
              addInput({
                id: nextId(),
                kind: "text",
                name: `pasted-text-${idCounter}.txt`,
                contentType: "text/plain",
                content,
                size: content.length,
              })
            }
            onAddFiles={(files) =>
              files.forEach((f) =>
                addInput({
                  id: nextId(),
                  kind: "file",
                  name: f.name,
                  contentType: f.type || "application/octet-stream",
                  file: f,
                  size: f.size,
                }),
              )
            }
            onAddUrl={addUrl}
            onRemove={removeInput}
            onClear={clearAll}
            onLoadSamples={loadSamples}
            onAnalyze={onAnalyze}
            analyzing={phase === "analyzing"}
            log={log}
          />
        </aside>

        <section className="content" ref={resultRef}>
          <Results phase={phase} result={result} log={log} />
        </section>
      </main>
    </div>
  );
}
