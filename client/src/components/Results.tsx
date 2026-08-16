import { useState } from "react";
import type { AnalysisResult } from "../types";
import PocPrototype from "./PocPrototype";

type Tab = "overview" | "process" | "solution" | "poc";

function Overview({ result }: { result: AnalysisResult }) {
  const a = result.analysis;
  return (
    <div className="tab-content">
      <p className="summary">{a.summary}</p>
      <Card title="Business goal">
        <p>{a.business_goal}</p>
      </Card>
      <div className="grid-2">
        <Card title="Key requirements">
          <List items={a.requirements} />
        </Card>
        <Card title="Missing / unclear information">
          {a.missing_information.length ? (
            <List items={a.missing_information} />
          ) : (
            <p className="muted">Nothing obviously missing — the inputs were fairly complete.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function ProcessTab({ result }: { result: AnalysisResult }) {
  const a = result.analysis;
  return (
    <div className="tab-content">
      <Card title="Current process">
        <ol className="steps">
          {a.current_process.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </Card>
      <Card title="Pain points">
        <ul className="pains">
          {a.pain_points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </Card>
      <Card title="Suggested improvements">
        <table className="table">
          <thead>
            <tr>
              <th>Problem</th>
              <th>Suggestion</th>
              <th>Impact</th>
            </tr>
          </thead>
          <tbody>
            {a.improvements.map((im, i) => (
              <tr key={i}>
                <td>{im.problem}</td>
                <td>{im.suggestion}</td>
                <td>{im.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SolutionTab({ result }: { result: AnalysisResult }) {
  const s = result.analysis.solution;
  return (
    <div className="tab-content">
      <div className="solution-title">
        <h3>{s.name}</h3>
        <p>{s.description}</p>
      </div>
      <div className="grid-2">
        <Card title={`Features (${s.features.length})`}>
          <List items={s.features} />
        </Card>
        <Card title={`User roles (${s.roles.length})`}>
          <div className="chips">
            {s.roles.map((r, i) => (
              <span className="chip" key={i}>
                {r}
              </span>
            ))}
          </div>
        </Card>
      </div>
      <Card title={`Screens / modules (${s.screens.length})`}>
        <div className="screen-grid">
          {s.screens.map((sc, i) => (
            <div className="screen-card" key={i}>
              <div className="screen-name">{sc.name}</div>
              <div className="muted">{sc.description || "—"}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Simple flow of the proposed app">
        <ol className="flow">
          {s.flow.map((f, i) => (
            <li key={i}>
              <span className="flow-step">{typeof f.step === "string" ? f.step : `Step ${f.step}`}</span>
              <span className="flow-actor">{f.actor}</span>
              <span className="flow-action">{f.action}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export default function Results({
  phase,
  result,
  log,
}: {
  phase: "idle" | "analyzing" | "done" | "error";
  result: AnalysisResult | null;
  log: { kind: "progress" | "warn" | "error"; text: string }[];
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [activeScreen, setActiveScreen] = useState(0);

  if (phase === "idle") {
    return (
      <div className="empty">
        <div className="empty-emoji">🧭</div>
        <h2>From scattered inputs to a working POC</h2>
        <p>
          Add client material on the left — meeting transcripts, WhatsApp exports, PDFs, documents, screenshots, or a
          website — then run the analysis. The tool will extract the business need, problems, missing information, a
          proposed solution, and a clickable prototype.
        </p>
        <div className="how">
          <div className="how-step"><b>1 · Collect</b><span>Upload files, paste text, or reference a website</span></div>
          <div className="how-step"><b>2 · Understand</b><span>Goal, current process, pain points, requirements, gaps</span></div>
          <div className="how-step"><b>3 · Improve</b><span>Practical suggestions for what to simplify or automate</span></div>
          <div className="how-step"><b>4 · Outline</b><span>Features, roles, screens, and a simple flow</span></div>
          <div className="how-step"><b>5 · Prototype</b><span>An interactive mock of the proposed app</span></div>
        </div>
      </div>
    );
  }

  if (phase === "analyzing") {
    const progressSteps = [
      "Reading uploaded file(s)",
      "Sending inputs to the local model",
      "Model is analysing",
      "Structuring the results",
      "Validating the model output",
    ];
    const completedSteps = log.filter((l) => l.kind === "progress").length;
    const pct = Math.min(Math.round((completedSteps / progressSteps.length) * 100), 95);
    const last = log[log.length - 1];

    return (
      <div className="empty">
        <div className="progress-wrap">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-pct">{pct}%</div>
        </div>
        <h2>Analysing your inputs…</h2>
        <p className="muted">This runs on your local Ollama model — it can take a minute or two.</p>
        {last && <div className="live-log">{last.text}</div>}
        {log.slice(0, -1).map((l, i) => (
          <div className="past-log" key={i}>
            ✓ {l.text}
          </div>
        ))}
      </div>
    );
  }

  if (phase === "error" && !result) {
    return (
      <div className="empty">
        <div className="empty-emoji">⚠️</div>
        <h2>Analysis failed</h2>
        {log
          .filter((l) => l.kind === "error")
          .map((l, i) => (
            <p className="error-text" key={i}>
              {l.text}
            </p>
          ))}
        <p className="muted">Adjust the inputs or switch the AI model, then retry.</p>
      </div>
    );
  }

  if (!result) return null;

  const a = result.analysis;
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "process", label: "Process & Pain" },
    { id: "solution", label: "Solution Outline" },
    { id: "poc", label: "POC Prototype" },
  ];

  return (
    <div className="results">
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => {
              setTab(t.id);
              if (t.id === "poc") setActiveScreen(0);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="result-meta">
        Analysed with <b>{result.model}</b> from {result.inputs.length} input
        {result.inputs.length > 1 ? "s" : ""}: {result.inputs.map((i) => i.name).join(", ")}
      </div>

      {tab === "overview" && <Overview result={result} />}
      {tab === "process" && <ProcessTab result={result} />}
      {tab === "solution" && <SolutionTab result={result} />}
      {tab === "poc" && (
        <PocPrototype
          appName={a.poc.app_name || a.solution.name}
          screens={a.poc.screens ?? []}
          active={activeScreen}
          onSelect={setActiveScreen}
        />
      )}
    </div>
  );
}
