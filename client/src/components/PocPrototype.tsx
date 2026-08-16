import type { PocBlock, PocScreen } from "../types";

function toItem(item: string | { name?: string; label?: string; value?: string; status?: string }): {
  label: string;
  value?: string;
  status?: string;
} {
  if (typeof item === "string") return { label: item };
  return { label: item.name ?? item.label ?? "", value: item.value, status: item.status };
}

function Block({ block }: { block: PocBlock }) {
  const items = (block.items ?? []).map(toItem);
  switch (block.type) {
    case "header":
      return (
        <div className="poc-block poc-header">
          <h3>{block.label || "App"}</h3>
          {block.meta && <p>{block.meta}</p>}
        </div>
      );
    case "heading":
      return <h4 className="poc-block poc-heading">{block.label}</h4>;
    case "text":
      return <p className="poc-block poc-text">{block.label}</p>;
    case "list":
      return (
        <div className="poc-block poc-list">
          {block.label && <div className="poc-list-title">{block.label}</div>}
          {items.map((it, i) => (
            <div className="poc-row" key={i}>
              <span>{it.label}</span>
              {it.value && <span className="muted">{it.value}</span>}
              {it.status && <span className={`poc-status st-${it.status.toLowerCase()}`}>{it.status}</span>}
            </div>
          ))}
        </div>
      );
    case "stats":
      return (
        <div className="poc-block poc-stats">
          {items.map((it, i) => (
            <div className="stat" key={i}>
              <div className="stat-value">{it.value ?? it.label}</div>
              <div className="stat-label">{it.label}</div>
            </div>
          ))}
        </div>
      );
    case "form":
      return (
        <div className="poc-block poc-form">
          {items.map((it, i) => (
            <label className="field" key={i}>
              <span>{it.label}</span>
              <input placeholder={it.value ?? "Enter value"} readOnly />
            </label>
          ))}
          <button className="poc-btn">{block.label || "Submit"}</button>
        </div>
      );
    case "button":
      return <button className="poc-btn">{block.label || "Action"}</button>;
    case "status":
      return (
        <div className="poc-block poc-status-line">
          <span className={`poc-status st-${(block.meta ?? block.label ?? "info").toLowerCase()}`}>
            {block.label || block.meta}
          </span>
        </div>
      );
    case "card":
      return (
        <div className="poc-block poc-card">
          <div className="poc-card-title">{block.label}</div>
          {block.meta && <div className="muted">{block.meta}</div>}
          {items.length > 0 &&
            items.map((it, i) => (
              <div className="poc-row" key={i}>
                <span>{it.label}</span>
                {it.value && <span className="muted">{it.value}</span>}
              </div>
            ))}
        </div>
      );
    default:
      return <p className="poc-block">{block.label}</p>;
  }
}

export default function PocPrototype({
  appName,
  screens,
  active,
  onSelect,
}: {
  appName: string;
  screens: PocScreen[];
  active: number;
  onSelect: (i: number) => void;
}) {
  if (!screens || screens.length === 0) {
    return (
      <div className="card">
        <p className="muted">The model did not produce prototype screens. Re-run with a different model for a richer POC.</p>
      </div>
    );
  }

  const current = screens[Math.min(active, screens.length - 1)];

  return (
    <div className="poc-wrap">
      <div className="poc-toolbar">
        <span className="poc-app-name">{appName}</span>
        <span className="poc-label">Clickable prototype (mock UI)</span>
      </div>
      <div className="phone">
        <div className="phone-nav">
          {(current.nav && current.nav.length > 0 ? current.nav : screens.map((s) => s.name)).map((n, i) => (
            <button key={i} className={`phone-tab ${n === current.name ? "active" : ""}`} onClick={() => onSelect(i)}>
              {n}
            </button>
          ))}
        </div>
        <div className="phone-body">
          {current.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
          {current.blocks.length === 0 && <p className="muted">Empty screen</p>}
        </div>
      </div>
      <div className="poc-screen-list">
        <div className="poc-screen-list-title">Screens</div>
        {screens.map((s, i) => (
          <button key={i} className={`poc-screen-item ${i === active ? "active" : ""}`} onClick={() => onSelect(i)}>
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
