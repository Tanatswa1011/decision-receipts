# Loom script: Decision Receipts (hard limit 5:00)

Tanatswa's own version, 8 Nov 2026. Facts checked against the run results in `docs/results.md` and `runs/`. **Bold** in quotes = lines to land with emphasis.

## Before recording (5 min)
1. `npm run dev`, browser at http://127.0.0.1:3100, zoom 110%, close other tabs.
2. `npm run demo:prep` (resets the live feed, replays the 60 decisions; wait for "12 flagged").
3. Header: **Live** + **AI off**. Open the Decisions page.
4. Have Cursor open on `lib/receipts/verify.ts`.

---

## 1. Hook (0:00–0:25)

**Screen: Live decision feed, showing ✓ Success.**

> "An AI agent just approved an €8,400 purchase.
>
> The log says success. But the supplier's certificate expired eight months ago.
>
> **The agent succeeded. The decision was wrong.**
>
> Companies need to catch these mistakes when decisions happen, not at month-end close when the money may already be gone.
>
> That's why I built Decision Receipts."

## 2. Live demo (0:25–1:45)

**Open receipt #14.**
> "This agent claimed the supplier was ISO 9001 certified.
>
> But the supplier database says the certificate expired eight months earlier.
>
> **Contradicted. €8,400 at risk.**"

**Click the SUP-104 evidence record.**
> "Here's the evidence. No source means no verified decision."

**Switch AI off.**
> "Watch this. I turn AI off, and it's still flagged.
>
> **The model doesn't decide what's true. Code does.**"

**Open receipt #22.**
> "This agent cited a contract that doesn't exist.
>
> That's unsupported, not contradicted."

**Open receipt #19.**
> "Here's something more interesting.
>
> Two orders to the same supplier within 32 hours, each below the €10,000 approval limit.
>
> Together, they trigger a potential split-order violation."

**Open Review Queue.**
> "The queue ranks decisions by money at risk.
>
> On my 60 synthetic decisions, the first 10 reviews all identify known bad decisions. Random checks would find fewer than three."

## 3. Architecture (1:45–2:15)

**Screen: README diagram → `verify.ts`.**
> "Here's how it works.
>
> Agents send events to one endpoint.
>
> AI extracts claims from their explanations. Invalid outputs are rejected.
>
> My deterministic verification engine then checks those claims against synthetic supplier, contract, ERP, and budget records.
>
> **AI extracts the claims. Code verifies the facts.**
>
> With AI off, it caught 12 of 16 known bad decisions. With GPT-4.1-mini, all 16, for around $0.0006 per decision."

## 4. What broke (2:15–2:50)

**Screen: BUILD_LOG.md.**
> "Three things broke.
>
> First, my own answer key missed an €18,500 approval above the €10,000 limit.
>
> Second, a date-boundary bug rejected certificates that expired on the decision day.
>
> Third, another model produced invalid output twice. My schema rejected both.
>
> **My biggest lesson? Even your ground truth needs verification.**
>
> These were template-generated test notes, so real agent logs are the next challenge."

## 5. What I'd build at Langdock (2:50–3:35)

**Screen: Settings → Langdock (UNTESTED).**
> "Next, I'd connect Decision Receipts to real company systems through read-only integrations.
>
> The business records stay outside the model. Code checks them directly.
>
> I couldn't find this specific per-decision verification approach in Langdock's public documentation as of November 7.
>
> If I joined, I'd test it against real customer agent logs, investigate the Agent and Audit Logs APIs, and explore pausing high-risk actions before execution.
>
> The architecture supports OpenAI-compatible endpoints, but Langdock integration is still untested.
>
> **My goal is simple: help companies trust not just that their AI agents ran, but that their decisions were supported by real evidence.**
>
> That's the internship I'd love to build."

---

## Fact check (8 Nov)
- €8,400, ISO expired 8 months before the approval, #14 contradicted: ✔ (SUP-104 expired 2026-02-07).
- #22 contract doesn't exist → **unsupported**: ✔ (contract claims unsupported in both AI-off and gpt-4.1-mini runs).
- #19 two orders, 32 h, each under €10k: ✔.
- Queue first 10 all bad; random 2.66 (< 3): ✔. 60 decisions, synthetic: ✔.
- AI off 12/16, gpt-4.1-mini 16/16, $0.0006 per decision: ✔.
- What broke: #12 €18,500 over the €10k limit; same-day expiry; gpt-5-nano invalid output ×2, rejected by the schema: ✔.
- No claim of a tested Langdock integration, real databases or customers: ✔. Hackathon line removed, so D4 no longer applies.

## Must-check before recording
- [ ] Time a dry run. Over 4:50? Cut the evidence click first, then the #19 "Here's something more interesting" line.
- [ ] Never say "Langdock lacks this", "production", "tested on Langdock" or "connects to real databases".
