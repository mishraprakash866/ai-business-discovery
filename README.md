# AI Business Discovery → POC

Candidate assignment submission. A working application that takes **scattered client inputs** (meeting transcripts, WhatsApp exports, PDFs, documents, screenshots, websites), **understands the business need**, and turns it into a **clear requirement, a proposed solution, and a clickable POC prototype** — fully locally, no external API keys.

![stack](https://img.shields.io/badge/Stack-Node.js%20%2B%20React%20%2B%20Ollama-4f46e5)

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Client (React + Vite)                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ InputPanel  │  │   Results    │  │  PocPrototype  │  │
│  │ (sidebar)   │  │  (tabs)      │  │  (phone mock)  │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────────┘  │
│         │                │                               │
│         └────────┬───────┘                               │
│                  │ api.ts (SSE streaming)                │
└──────────────────┼───────────────────────────────────────┘
                   │ HTTP (proxied via Vite dev server)
┌──────────────────┼───────────────────────────────────────┐
│                  ▼     Server (Express + TypeScript)      │
│  ┌────────────────────────────────────────────────────┐  │
│  │              index.ts (Express API)                │  │
│  │  - POST /api/analyze   (SSE streaming endpoint)   │  │
│  │  - GET  /api/health    (Ollama status check)      │  │
│  │  - GET  /api/samples   (sample data metadata)     │  │
│  │  - POST /api/extract-url (website scraping)       │  │
│  └──────────┬──────────────────┬─────────────────────┘  │
│             │                  │                         │
│  ┌──────────▼─────┐  ┌────────▼────────┐               │
│  │  ai.ts         │  │  extract.ts     │               │
│  │  (Ollama       │  │  (PDF/DOCX/URL  │               │
│  │   client)      │  │   extraction)   │               │
│  └───────┬────────┘  └─────────────────┘               │
│          │                                              │
│  ┌───────▼──────────────┐                               │
│  │  Ollama (localhost)  │                               │
│  │  llama3:latest       │                               │
│  └──────────────────────┘                               │
└──────────────────────────────────────────────────────────┘
```

## How to run

### Prerequisites

- **Node.js 18+** (tested on 24)
- **Ollama** running locally with at least one chat model. Recommended models (must support structured JSON): `llama3:latest`, `qwen2.5`. Install with:
  ```bash
  ollama pull llama3:latest
  ```
  > Tip: pick a model that fits your RAM. `llama3:latest` (~4.7 GB) is the reliable default used by the app.

### 1. Start the API server

```bash
cd server
npm install
npm run dev        # http://localhost:3001
```

### 2. Start the web app

```bash
cd client
npm install
npm run dev        # http://localhost:5173
```

Open http://localhost:5173, click **"Load sample client pack"** and then **"Run analysis →"** to see the full flow with a realistic example (BrightCart — a small retailer drowning in manual order processing).

### Configuration (optional)

Set in the environment before starting the server:

| Variable       | Default                  | Purpose                                  |
| -------------- | ------------------------ | ---------------------------------------- |
| `OLLAMA_HOST`  | `http://localhost:11434` | Ollama endpoint                          |
| `OLLAMA_MODEL` | `llama3:latest`          | Default model (can be changed in the UI) |
| `PORT`         | `3001`                   | API port                                 |

---

## What the app does

1. **Take client inputs** — upload PDF/DOCX/TXT/MD/HTML/screenshots, paste raw text (transcripts, call notes, WhatsApp exports), or reference an existing website (fetched and read server-side).
2. **Understand the business need** — the local model extracts the main goal, the current process, pain points, key requirements, and missing/unclear information.
3. **Suggest a better process** — practical problem → suggestion → impact table.
4. **Create a solution outline** — proposed app name, description, features, user roles, screens/modules, and an end-to-end flow.
5. **Create a basic POC** — the app renders the model's proposed solution as an **interactive clickable prototype** (phone mock-up with real screens derived from the client's own words).

Streaming: analysis runs as server-sent events so the UI shows live progress ("reading files → analysing → structuring results").

---

## Design decisions

| Decision                                 | Rationale                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local Ollama instead of a hosted LLM** | Assignment emphasises a self-contained POC; no API keys, works offline, cost-free. Model is selectable in the UI.                                                                                                                                                                    |
| **Structured JSON from the model**       | A strict schema (`goal`, `current_process`, `pain_points`, `improvements`, `solution`, `poc`) is passed in the system prompt and `format: "json"` is forced, so the analysis is predictable and renderable. A defensive parser strips markdown fences and finds the outermost `{…}`. |
| **SSE streaming**                        | Local models are slow (8B+ models); streaming progress keeps the UX honest instead of a silent wait.                                                                                                                                                                                 |
| **Server-side file extraction**          | PDFs (pdf-parse), DOCX (mammoth), and text formats are decoded on the API, so the browser never needs to parse documents. Screenshots are accepted and surfaced as "unreadable without OCR" so no input silently disappears.                                                         |
| **Simple but complete stack**            | Express + React (Vite). No heavy state library, no UI framework — keeps the deliverable small and the engineering easy to follow.                                                                                                                                                    |
| **Built-in sample pack**                 | A realistic multi-source client story (2 transcripts + WhatsApp export + process doc) that demos every part of the tool with one click — also used by reviewers who don't have real client data.                                                                                     |

## Project structure

```
server/
  src/
    index.ts      # Express API + SSE streaming endpoint
    ai.ts         # Ollama client, system prompt, JSON schema, response parsing
    extract.ts    # PDF/DOCX/text/URL → plain text
    samples.ts    # built-in sample client data pack
client/
  src/
    App.tsx                 # state + orchestration
    api.ts                  # API calls + SSE stream reader
    components/InputPanel.tsx   # upload / paste / URL / samples + progress log
    components/Results.tsx      # Overview / Process / Solution tabs
    components/PocPrototype.tsx # interactive phone-mock renderer
    types.ts / styles.css
```

## Example scenario walk-through

The built-in sample pack tells the story of **BrightCart**: two discovery calls, a messy WhatsApp order group, and a current-process document. Running the analysis produces:

- **Business goal** — one system where a salesperson records an order in under a minute and the warehouse sees it instantly.
- **Pain points** — 47 wrong shipments/month from re-typing, 2-day order confirmation, manual Friday stock counts, no customer visibility.
- **Missing information** — e.g. whether SMS/WhatsApp customer notifications are mandatory, delivery fleet integration.
- **Solution outline** — a mobile order management app (order entry, warehouse queue, stock check, payment reconciliation, customer status).
- **POC prototype** — clickable screens: order entry form, warehouse task list, order status with status pills.

## What is not covered (scope notes)

- No live integration with Teams/WhatsApp (per assignment, sample exports are acceptable).
- No OCR for screenshots (no vision model installed locally; the app flags this as missing information instead of dropping it).
- Prototype is a rendered mock, not a production app.
