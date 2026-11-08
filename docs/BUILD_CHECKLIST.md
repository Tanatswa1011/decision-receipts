# Build checklist: live telemetry, no paid tools

Drafted and approved 8 Nov 2026. Status updated 8 Nov 2026 after building; proof in brackets.
Each item lists **Done when** (the proof). Tick only with that proof.

## Decisions this checklist assumes
- **No n8n Cloud, no paid tools.** n8n's role is replaced by a built-in agent plus a replay script. The endpoint stays n8n-compatible, so free self-hosted n8n can still post to it later.
- **Same telemetry contract as ACPT:** `run.started` → `workflow.step.completed|failed` → `run.completed`, as used by the AI Invoice Agent workflow (`Downloads/ai-mission-control-workflows`). That workflow is a format reference only; its URL, template text and third-party nodes are not copied.
- **Still local, no logins, no database:** events go to a local file.
- **The analysis core stays as built.** Verdicts are still set by code only.

---

## Phase 1: Telemetry endpoint (push, like ACPT)
- [x] **1.1 Reuse ACPT's event contract unchanged.** Copy `lib/contracts/ingest-event.ts` and credit it in the README table.
  *Done when:* the file is byte-identical to ACPT and listed in the README.
- [x] **1.2 `POST /api/events`.** Bearer key, Zod validation, de-duplication on `event_id`, events appended to `runs/live/events.jsonl`. Same status codes as ACPT: 201 accepted, 200 duplicate, 400 invalid, 401 bad key.
  *Done when:* curl tests return each code.
- [x] **1.3 Ingest key.** Generated in Settings, shown masked, can be rotated, kept server-side only (same rules as the LLM key).
  *Done when:* a request with the old key gets 401 after rotation.
- [x] **1.4 n8n compatibility.** The exact body shapes from the AI Invoice Agent HTTP nodes (with tab-padded field names and string amounts) are accepted.
  *Done when:* a test replays them and gets 201.

## Phase 2: Events → decisions → receipts
- [x] **2.1 Mapping spec** (`docs/TELEMETRY_MAPPING.md`). One run (`external_run_id`) = one decision. A step with `action` `po.approve`, `po.reject` or `payment.release` = the decision. Its `after_state` = the structured tool-call fields. `risk_metadata.rationale` = the free text. Lookup steps = what the agent saw.
  *Done when:* the doc exists with an example run.
- [x] **2.2 Adapter.** On `run.completed`, build a `Decision`, run the existing verifier, and save the receipt. A failed run shows as failed and gets no receipt.
  *Done when:* a replayed run produces the same receipt as its JSON twin.
- [x] **2.3 Honest handling of unknown actions.** An event like `invoice.sent` is stored and shown as "no checks defined for this action", never as verified.
  *Done when:* the test passes and the UI shows it.
- [x] **2.4 "Agent saw" vs "record says".** When a lookup step logged what the agent read, the receipt shows it next to the independent system-of-record value. The verdict still comes only from the system of record.
  *Done when:* receipt #14 shows "agent saw: certified (cached)" vs "record: expired 2026-02-07".

## Phase 3: Free ways to produce live decisions
- [x] **3.1 Built-in procurement agent** (`npm run agent:live`, plus a button in Settings). A real tool-calling LLM agent using the Settings key from any provider. Tools: `lookup_po`, `lookup_supplier`, `lookup_contract`, `check_budget`. It posts telemetry for every step over HTTP to `/api/events`, like the n8n nodes did, not in-process.
  *Done when:* one live run appears as a receipt.
  *Status:* first checked against a scripted mock; then **run on gpt-4.1-mini (8 Nov night)**: 6 live runs became receipts, PO-4601 and PO-4605 flagged (stale cache), PO-4603 correctly rejected. See BUILD_LOG.
- [x] **3.2 Documented failure injection.** The agent's supplier tool reads a stale cache for some suppliers, the realistic way #14 happens. It is listed in the README as deliberately injected.
  *Done when:* the cache file and README note exist.
- [x] **3.3 Replay script** (`npm run agent:replay`, plus a button). Streams the 60 synthetic decisions as telemetry at an adjustable speed. Needs no key and gives the same result every time; this is the Loom safety net.
  *Done when:* replay ends with the same 11 flagged as the offline run.
- [x] **3.4 "Connect your own agent" examples.** curl, a free self-hosted n8n HTTP Request node, and a Langdock workflow HTTP step. The Langdock one is marked **untested**.
  *Done when:* the curl example works and the other two are labelled.

## Phase 4: Live UI
- [x] **4.1 Sources panel in Settings.** Endpoint URL and key with copy buttons, last event time, and counts of accepted / duplicate / rejected events with the reasons for rejection.
- [x] **4.2 Live decision log.** New receipts appear without reloading (polling every 2 s), with a "Live" indicator and a source label (replay / built-in agent / external).
- [x] **4.3 Run timeline on each receipt.** Started → each step → completed, with timestamps, like ACPT's run view.
- [x] **4.4 Reset live data** button, which clears only `runs/live/`.
  *Done when (4.1–4.4):* checked in the browser at desktop and phone width, light and dark, with no console errors. [Checked at desktop in the browser: Live switch, auto-refresh (a curl run appeared within one poll), Reset → Start replay with progress → 11 flagged, no console errors. Phone width (375 px): live feed and Settings show no sideways scrolling; the Live badge wrap was fixed.]

## Phase 5: Proof and honesty
- [x] **5.1 Tests:** auth, validation, duplicates, adapter mapping, unknown actions, n8n body compatibility. [`scripts/test-live.ts`, 9 tests; `npm test` runs all 40]
- [x] **5.2 Measure** ingest → receipt latency (ms) and record the real number.
- [x] **5.3 Live-agent numbers** (needs a key): decisions made, flagged, cost and latency per decision, from a real run.
- [x] **5.4 BUILD_LOG:** why n8n was swapped (cost), plus every real breakage as it happens.
- [x] **5.5 README:** data-flow diagram, ACPT reuse (event contract and telemetry pattern), what is untested (Langdock, self-hosted n8n).

## Still open from earlier (unchanged)
- [x] AI-on extraction numbers for two models (gpt-4.1-mini and gpt-5-nano, 8 Nov night; docs/results.md).
- [ ] Tick `docs/uniqueness-checklist.md` with proof.
- [ ] Human label pass 3 by Tanatswa.
- [ ] Set `eur_per_usd` so costs show in €.

## Out of scope (say no unless Tanatswa asks)
- Database, user accounts, multi-tenant workspaces (ACPT's Neon/Clerk parts).
- ACPT's recovery / rollback flow.
- Real ERP, supplier or contract connectors (records stay synthetic).
- Deployment, pushing to GitHub, publishing.
