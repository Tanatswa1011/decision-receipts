# Decision Receipts

Every AI-agent decision gets a **receipt** listing the facts it relied on. **Code, not a model**, checks each fact against the systems of record (ERP purchase orders, supplier database with ISO 9001 expiry, budget table, contracts, approval policy). Each fact comes back **verified**, **contradicted** (the source says otherwise) or **unsupported** (no source at all), with the evidence ID it was checked against. A review queue ranks flagged decisions by **€ at risk**.

Prototype for a Langdock "Build Your Own Internship" application. Synthetic data only: Kesselfeld Antriebstechnik GmbH and all of its suppliers, people and IDs are invented.

**Live demo (read-only):** https://decision-receipts-seven.vercel.app · **Loom walkthrough:** https://www.loom.com/share/b1d3c33a930f406aab11ebbf34091bd2
The hosted copy runs in public demo mode (`DR_PUBLIC_DEMO=1`, see [docs/DEPLOY.md](docs/DEPLOY.md)): saved runs and a live-feed snapshot, no keys, no model calls, ingest off. Run it locally for the full app.

## Run it (no logins, no database)
```bash
npm install
npm run data:generate   # synthetic dataset + labels (deterministic)
npm test                # 42 tests (verifier, schema gate, provider selection, live ingest), no network
npm run run:offline     # AI off: code-only receipts -> runs/offline.json
npm run eval            # precision/recall, queue vs random -> runs/metrics.json, docs/results.md
npm run dev             # http://127.0.0.1:3100
```
AI on: **bring your own key.** The easiest way is in the app: **Settings · model & key** (`/settings`). Pick a provider, paste a key, click *Test on receipt #14*, then *Run AI extraction on all 60*. The key stays on the local server and is never sent back to the browser (only the last 4 characters are shown); it lives in memory unless you tick *Remember*, which writes git-ignored `.env.local`. The dev server binds to 127.0.0.1 only.

From the command line instead: put any one provider key in `.env` (copy `.env.example`; `.env` is git-ignored) and the first key found is used. To choose explicitly, set `LLM_PROVIDER` or pass `--provider`:
```bash
npm run run:llm                                              # whichever key is in .env
npm run run:llm -- --provider=openai --model=gpt-4.1-mini
npm run run:llm -- --provider=anthropic --model=claude-haiku-5-5
npm run eval                                                 # compares every run in runs/
```
| Provider | Key in `.env` | Protocol |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | OpenAI chat completions |
| Anthropic | `ANTHROPIC_API_KEY` | Anthropic Messages |
| Google Gemini | `GEMINI_API_KEY` | Gemini's OpenAI-compatible endpoint |
| Mistral / Groq / OpenRouter | `MISTRAL_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` | OpenAI-compatible |
| Ollama (local) | none | OpenAI-compatible, `localhost:11434` |
| Langdock | `LANGDOCK_API_KEY` + `LLM_BASE_URL` | OpenAI-compatible, **untested** |
| Anything else | `LLM_PROVIDER=custom`, `LLM_API_KEY`, `LLM_BASE_URL` | OpenAI-compatible |

A provider only counts as tested once a run file for it exists in `runs/`. Langdock's endpoint has **not** been tested.

## Live data: telemetry, like ACPT (no paid tools)
Decisions can also arrive **live**: any agent posts ACPT-format telemetry (`run.started` → `workflow.step.completed|failed` → `run.completed`) to `POST /api/events` with a bearer ingest key. When a run completes, it is verified straight away; switch the header to **Live** to watch receipts arrive.

```
built-in agent ─┐                                   ┌─► adapter: run → decision ─► verifier ─► receipt (live feed)
replay script ──┼─► POST /api/events (key, Zod, ───┤
your agent ─────┘   duplicate check, local JSONL)   └─► Sources panel: accepted / duplicate / rejected
```
- **Settings → Sources:** generate the ingest key, start the replay or the built-in agent, see counts, reset live data.
- `npm run agent:replay`: the 60 synthetic decisions as 180 events. Free, no key, same 12 flagged every time (AI off).
- `npm run agent:live`: the **built-in procurement agent**, a real tool-calling LLM agent (any provider in Settings) that decides 6 pending requests (`data/requests.json`). **Injected failure, on purpose:** its `lookup_supplier` tool reads a stale supplier cache (`data/agent-cache/suppliers.json`, snapshot of 15 Jan 2026), the way real agents end up approving on an expired certificate. Each receipt shows what the agent saw next to what the record says; only the record decides the verdict.
- Connect your own agent (curl tested; self-hosted n8n and Langdock **untested**): [docs/CONNECT_YOUR_AGENT.md](docs/CONNECT_YOUR_AGENT.md). Mapping rules: [docs/TELEMETRY_MAPPING.md](docs/TELEMETRY_MAPPING.md).
- n8n was replaced because n8n Cloud costs money. The endpoint keeps ACPT's n8n format, so free self-hosted n8n can still post to it.
- Measured: ingest → receipt p50 15.3 ms, p95 17.3 ms (60 replay runs, local).

## How it works
```
agent decision log ──► claims ──► deterministic verifier ──► receipt ──► € at risk queue
   (tool call +         │            (ACPT evaluate.ts /          │
    free text)          │             compare.ts, unchanged)      └─ evidence ID per verdict
                        ├─ tool-call fields → claims   (code)
                        └─ free text → claims          (model, Zod-validated, quote must appear in text)
```
- **The model's one job** (`lib/receipts/llm.ts`, provider chosen in `lib/receipts/providers.ts`): split the free-text rationale into typed claims from a closed list. It never sees the systems of record and never sets a verdict. Invalid JSON or a schema failure rejects the whole output; a claim whose quote isn't in the note is rejected on its own. Both are counted and shown.
- **AI off** (`lib/receipts/structured.ts`): the agent's tool-call payload becomes claims by plain code. Structured logs still get full verdicts; free-text-only logs show as *unverifiable*, never as verified.
- **Verifier** (`lib/receipts/verify.ts`): each claim becomes an ACPT "expected rule" and each looked-up record an ACPT "evidence event"; ACPT's `passed / failed / insufficient_evidence` maps to `verified / contradicted / unsupported`.
- **Policy** (`lib/receipts/policy.ts`): the agent's €10,000 single-approval limit (via ACPT's `compare.ts`), and split orders across decisions (same supplier and cost center within 72h, each ≤ €10,000, together above it).
- **Queue** (`lib/receipts/pipeline.ts`): flagged by € at risk, then unverifiable, then verified.

## What came from ACPT
ACPT / AI Mission Control was Tanatswa's solo entry at the Summer Up hackathon (CODE University Berlin, Aug 2026; 16 commits, sole author). These files are copied **unchanged** from ACPT commit `ed648c0` (13 Aug 2026, "Add deterministic Verification v1"):

| File | Role here |
|---|---|
| `lib/verification/compare.ts` | operators (`eq`, `gte`, `lt`, `exists`…) and run aggregation |
| `lib/verification/evaluate.ts` | rule evaluation: produces every verdict |
| `lib/verification/normalize.ts` | conservative type normalization (currency, date) |
| `lib/verification/evidence-resolver.ts` | picks the evidence record and value |
| `lib/verification/path-resolve.ts` | dot-path lookup into records |
| `lib/contracts/workflow-verification.ts` | verification status contract (copied for reference; not imported yet) |

Copied **unchanged** from ACPT commit `759a874` (6 Aug 2026, "Add Phase 2 event and recovery Zod contracts"):

| File | Role here |
|---|---|
| `lib/contracts/ingest-event.ts` | the telemetry event contract that `POST /api/events` validates against |

**Pattern reused, code rewritten:** ACPT's `POST /api/events` (bearer key, schema check, de-duplication on `event_id`, same status codes) and its n8n HTTP Request node telemetry. Here it stores to a local file instead of Neon, has one key instead of per-connection credentials, and has no workspaces.

Not brought over: Clerk, Neon, Supabase, workspaces, recovery/rollback, the Next.js app shell. Everything else in this repo is new.

## Numbers
Measured 8 Nov 2026 on the 60-decision labelled set (16 bad after the manual label review found #12). Same data, same code, two models plus no model:

| | AI off (code only) | gpt-4.1-mini | gpt-5-nano |
|---|---|---|---|
| Bad decisions caught (recall) | 12/16 (75%) | 16/16 | 16/16 |
| False flags | 0 | 0 | 0 |
| Claim extraction recall / precision | n/a | 100% / 99.3% | 90.8% / 100% |
| Model outputs rejected by schema | n/a | 0 | 2 |
| Latency per decision (p50) | 0.33 ms | 2.04 s | 21.95 s |
| Cost per decision (list price) | $0 | $0.0006 | $0.0018 |
| Verdicts set by code | 410/410 | 564/564 | 541/541 |

- Review queue: all of the first 10 reviews hit a bad decision (10 of 16), vs 2.7 for random spot checks and 8 for "largest orders first".
- Built-in agent on gpt-4.1-mini: 6 live requests; it approved 2 off its stale cache, and both receipts were flagged (€7,560 and €3,200 at risk).
- **Caveat:** the free-text notes come from the generator's own templates, so a perfect extraction score shows the pipeline works, not how it would do on messy real logs.

All numbers come from `npm run eval` on real runs. See [docs/results.md](docs/results.md) (generated) and the `/metrics` page. Model prices in `config/prices.json` come from third-party aggregators checked 8 Nov 2026; confirm them on OpenAI's pricing page before quoting.

## Limits (honest)
- Synthetic, generator-made dataset of 60 decisions. Planted bad decisions are larger than average, which helps both the € ranking and the "largest orders first" baseline.
- Labels: pass 1 planted at generation, pass 2 an independent script (`scripts/label-pass2.ts`). A manual human pass is still to do.
- The budget check uses a fixed Q4 snapshot, not a running ledger.
- Langdock integration is a one-line base-URL change in theory and **untested** in practice.
- The built-in agent's loop has only been run against a scripted mock endpoint so far, not a real model (no key yet).
- Live events are stored in a local JSONL file and re-read on each request; fine for a demo, not for thousands of events.

See `BUILD_LOG.md` for what broke while building it.
