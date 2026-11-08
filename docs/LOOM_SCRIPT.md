# Loom script: Decision Receipts (target 4:45, hard limit 5:00)

About 650 spoken words at ~130 words/min: tight. **Drop the optional agent beat unless your rehearsal runs under 4:40.** **Bold** = what's on screen. [Brackets] = Tanatswa writes or confirms in their own words; don't read placeholders out.

## Before recording (5 min)
1. `npm run dev`, browser at http://127.0.0.1:3100, zoom 110%, close other tabs.
2. `npm run demo:prep` (resets the live feed, replays the 60 decisions; wait for "12 flagged"). Or Settings → Sources → **Reset** → **Start replay**.
3. Header: **Live** + **AI off**. Open the Decisions page.
4. Have Cursor open on `lib/receipts/verify.ts` and `lib/verification/evaluate.ts`.
5. Optional live moment: Settings → Sources → **Run agent** (gpt-4.1-mini, about 25 s, about $0.007).

---

## 1 · Problem (0:00–0:40)
**Screen: Live decision feed, every agent log row says ✓ success.**

> "Companies now build their own agents on platforms like Langdock and let them approve purchase orders and payments. Their logs say *success*. But success only means the agent finished, not that the facts it relied on were true. Today a company finds the wrong ones at month-end close, when the books don't add up and the money is already gone. [At the Summer Up hackathon I built ACPT, which I pitched as governance software for AI agents. Nobody signed a letter of intent. The lesson: nobody buys 'governance'. They buy 'don't lose money on a wrong AI decision'.] So this time I lead with money at risk, and check every decision the moment it's made."

## 2 · Live demo (0:40–2:35)
**Click receipt #14.**
> "This approval cost €8,400. The agent said the supplier is ISO 9001 certified. Code looked it up in the supplier database: the certificate expired eight months before the approval. Contradicted, €8,400 at risk, with the evidence record one click away."

**Click the SUP-104 evidence chip, then back.**
> "Every verdict cites a record. No record, no 'verified'."

**Header: switch AI off ↔ gpt-4.1-mini. Receipt stays flagged.**
> "That verdict doesn't come from a model. With the model switched off it's still flagged, because it's a date comparison against the system of record."

**Back to the feed. Click #22.**
> "Here the agent cited contract CTR-2026-099. It doesn't exist. That's a different verdict: not 'the source says otherwise', but 'there is no source'. A hallucinated citation."

**Click #19.**
> "And this one is only visible across decisions: two orders to the same supplier in 32 hours, each just under the €10,000 approval limit. A split order." (#12, a single €18,500 approval above that limit, is also flagged; mention only if time allows.)

**Optional: Run timeline of a built-in-agent receipt (PO-4601).**
> "These decisions arrive as live telemetry, like my old n8n setup. This one came from a real GPT-4.1-mini agent whose supplier cache was stale. It saw 'certified'; the record says expired."

**Open Review queue.**
> "Reviewers start at the top, ranked by euros at risk. On my labelled set of 60 decisions, every one of the first 10 reviews hits a bad decision. Random spot checks find fewer than 3."

## 3 · Architecture (2:35–3:25)
**Screen: README diagram, then verify.ts → evaluate.ts.**
> "Agents post events to one endpoint, using the same event contract as my hackathon project. The model does exactly one narrow job: split free text into typed claims. Its output must pass a Zod schema, and every quote must appear in the original text, or it's rejected and counted. Then deterministic code, my verification core from ACPT, copied unchanged, compares each claim with the ERP, the supplier database, budgets and contracts. Swap the model and the verdicts don't change: with AI off it catches 12 of 16, with the model 16 of 16, at about six hundredths of a US cent per decision."

## 4 · What broke (3:25–4:05)
**Screen: BUILD_LOG.md, scrolled to the entries.**
> "Three real failures from my build log. One: my own answer key was wrong. My generator created two split orders by accident, and a review of my labels found an €18,500 approval marked fine, above the agent's own €10,000 limit, a rule I wasn't checking yet. Both are fixed and logged. Two: a certificate expiring on the decision day counted as expired; dates had to be inclusive. Three: the cheaper reasoning model broke the output format twice. The schema rejected it instead of passing it through, and it was eleven times slower. One honest caveat: my test notes come from templates, so messy real logs are the next test."

## 5 · What next / at Langdock (4:05–4:55)
**Screen: Settings → provider list with "Langdock (UNTESTED)".**
> "Next, I'd replace my synthetic files with read-only connections to a customer's real systems: their ERP, supplier database and contracts. The checking code stays the same, and the customer's records never go to the model; only the agent's own text does. I couldn't find per-decision checks against systems of record in your docs as of 7 November. At Langdock, I'd first test this on two or three customers' real agent logs, check whether your Audit Logs API or Agent API exposes what an agent did per run, and let a failing receipt flag or pause the agent through your Governance API. It already runs on any provider; Langdock's endpoint is a base-URL change I haven't tested. That's the internship I'd like to build."

---

## Must-check before recording
- [x] **E3:** API names checked 8 Nov in docs.langdock.com: Audit Logs API (`GET /audit-logs/{workspace_id}`, workspace API key), Agent API, Governance API (list/get agents; PATCH to disable or re-enable with a reason). **Not confirmed:** whether audit logs contain per-run tool-call data, which is why the line says "check whether".
- [ ] **D4:** rewrite the hackathon lines in your own words; no prospect names or counts unless you confirm them.
- [ ] Time a dry run; cut the optional agent beat first if over 4:50, then the evidence click.
- [ ] Never say it already connects to real databases or has customers; say "next I'd".
- [ ] Never say "Langdock lacks this"; say "I couldn't find it in your docs as of 7 November".
