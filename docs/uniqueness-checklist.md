# Decision Receipts: "unique, not an AI wrapper" checklist

Every box must be ticked **with proof** before we record the Loom. "Proof" means something visible in the demo, the code or a number. A good sentence in the voice-over doesn't count.

Working definition. **An AI wrapper** is a product whose answer comes from a single model call, so swapping the model swaps the product. **Decision Receipts** has to be a system where the model does one narrow job (splitting a decision into claims) and *code decides what's true*.

Status updated 8 Nov 2026 (night) after the first real model runs. ☑ = proof exists · ◐ = partly · ☐ = open.

---

## A. Not a wrapper: the AI is narrow, checked and replaceable
| # | Test | How we prove it | Status and proof |
|---|---|---|---|
| A1 | **AI-off test:** with the LLM switched off, structured claims (IDs, amounts, dates, cert status) still get verdicts | A toggle in the demo, with the verdicts still appearing | ☑ "AI off" switch in the header; 12/16 bad caught with no model, 410 verdicts (`runs/offline.json`) |
| A2 | **Code decides truth:** a model never sets verified / contradicted / unsupported | Show `evaluate.ts` / `compare.ts` producing the verdict | ☑ `lib/receipts/verify.ts` → ACPT `lib/verification/evaluate.ts` → `compare.ts`; 564/564, 541/541 and 410/410 verdicts set by code |
| A3 | **Every verdict cites evidence**; no evidence means "unsupported", never "verified" | Click a verdict to see the source record | ☑ Evidence chips → `/evidence/[id]`; test "every verified verdict cites an evidence ID that resolves" |
| A4 | **Model output is validated** (Zod); invalid output is rejected and counted | A counter in the run summary | ☑ gpt-5-nano: **2 outputs rejected** (D-003, D-029, `claimed_valid` on the wrong claim type); counter in the header and on the Results page; raw outputs on `/metrics` |
| A5 | **No made-up sources** | A demo case where the agent cites a fictitious contract | ☑ #22 (CTR-2026-099) and #35 (CTR-2026-061): "unsupported, record not found" |
| A6 | **Model-swappable:** 2 models via config, results compared | A table: model A vs B on the same labelled set | ☑ gpt-4.1-mini vs gpt-5-nano (README → Numbers, `docs/results.md`); any provider via Settings |
| A7 | **Cost and latency per decision** measured | Numbers in the run summary | ☑ gpt-4.1-mini $0.00060 / 2.04 s; gpt-5-nano $0.00178 / 21.95 s; code only 0.33 ms. (Shown in $; € pending a stated rate. Prices from aggregators, to confirm.) |

## B. Unique compared with what Langdock already ships (checked 7 Nov 2026)
| # | Test | Their feature it must differ from | Status and proof |
|---|---|---|---|
| B1 | Works on **real decision logs after deployment**, not prepared test sets | Agent Evals | ☑ Live telemetry: `POST /api/events` with the ACPT contract; the built-in agent's runs became receipts as they happened |
| B2 | Works **per decision**, not per agent version | Governance | ☑ One receipt per decision (`/receipt/[no]`), with its own € at risk |
| B3 | Checks against **systems of record and across many decisions** | Guardrails node | ☑ ERP / supplier DB / budget / contracts lookups; cross-decision split-order check (#19 + #18) |
| B4 | The Loom says "I couldn't find this in your docs as of 7 Nov", never "Langdock lacks this" | (honesty) | ☐ In the Loom script; ticks when recorded |

## C. Unique compared with the hallucination-tool market
| # | Test | How we prove it | Status and proof |
|---|---|---|---|
| C1 | **Decision-level, not text-level** | Receipt shows the action and the facts it relied on | ☑ Receipt banner: action, supplier, "1 of 10 facts failed" |
| C2 | **Business impact:** € at risk | € column in the review queue | ☑ Queue ranked by € at risk; €224,600 at risk on caught bad decisions (AI on) |
| C3 | **Risk-ranked queue beats random spot checks** | One measured number | ☑ First 10 reviews: **10 of 16 bad** (10/10 hits) vs **2.7** random and 8 for "largest orders first" |
| C4 | **"Contradicted" and "unsupported" are separate verdicts** | Both appear in the demo with different handling | ☑ #14 contradicted (cert expired) vs #53 unsupported (no cert on file) and #22 (no such contract); different colours and wording |

## D. Unique to you
| # | Test | Evidence | Status and proof |
|---|---|---|---|
| D1 | Built on **your own earlier code** (ACPT, Summer Up, Aug 2026) | Git history (16 commits, sole author) | ☑ ACPT repo: 16 commits, sole author; 6 files copied byte-identical, listed in README |
| D2 | Labelled set built like real ground-truth work: guide, edge cases, second pass | `labels/` | ◐ Label guide, edge cases, scripted second pass, review sheet `labels/LABEL_REVIEW.md`. Preparing the manual pass already found a real mislabel (#12, over the approval limit) that both earlier passes missed. **The human review was skipped for the 8 Nov deadline; stays partial.** |
| D3 | **Honest "what broke"**, written while building | `BUILD_LOG.md` | ☑ Dated entries: accidental split orders, `gt` vs `gte` on dates, "fetch failed", forget-key bug, mock crashes, gpt-5-nano rejections |
| D4 | The hackathon "failure" told honestly | Your own words | ☐ In the Loom script (your words; no prospect names or counts unless you confirm) |

## E. Langdock fit and demo quality
| # | Test | Status and proof |
|---|---|---|
| E1 | One clear lean-in moment: green approvals, then #14 approved on a cert that expired 8 months earlier | ☑ #14 banner "ISO 9001 certificate QC-55120 expired on 2026-02-07, 8 months before this decision". Note: #19 (split order) is also flagged in the first 20; the script uses it as the second beat |
| E2 | Any OpenAI-compatible endpoint, base-URL swap to Langdock (stated as untested) | ☑ Settings → provider "Langdock (UNTESTED)" / custom base URL; tested on OpenAI only |
| E3 | "At Langdock" section names their real APIs (Audit Logs / Agent API exports → Governance) | ◐ Names checked in docs.langdock.com (8 Nov): Audit Logs API, Agent API, Governance API (disable/re-enable an agent with a reason). Whether audit logs include per-run tool calls is unconfirmed, so the script says "check whether". Ticks when recorded |
| E4 | Synthetic company and data only | ☑ Kesselfeld Antriebstechnik GmbH and all suppliers are invented; no kloeckner.i material |
| E5 | ≤5 min, live demo, no slides, problem → demo → architecture → what broke → what next | ☐ Script drafted; ticks when recorded |
| E6 | Can't break on logins: no Clerk or Neon | ☑ Runs locally with `npm run dev`, no accounts; the replay needs no key |

## F. Red flags: if any of these is true, we've built a wrapper
All five are currently **false**:
- [ ] The key demo moment depends on an LLM's opinion, not a database check. *False: #14 is a date comparison against the supplier DB, and it works with AI off.*
- [ ] We have no measured numbers. *False: see below.*
- [ ] One prompt does most of the work. *False: the prompt only splits text into claims; verification, policy, queue and ingest are code.*
- [ ] You can't explain a design decision without "the AI did it". *False: each design decision is logged in BUILD_LOG.*
- [ ] Turning the model off makes the whole product disappear. *False: AI off still catches 12/16.*

## Numbers to report (measured on the synthetic labelled set; never estimated)
- Labelled decisions: **N = 60** (16 bad: 15 planted + #12 found in manual review)
- Detection (flagged = contradicted or unsupported): **AI off precision 100% / recall 75%** (12/16) · **AI on, gpt-4.1-mini: 100% / 100%** (16/16) · gpt-5-nano: 100% / 100%
- Share of verdicts made by code vs by a model: **100% / 0%**
- Review queue: bad decisions in the first 10 reviews **10** (of 16) vs random **2.7**
- Cost and latency per decision: **$0.0006 / 2.0 s** (gpt-4.1-mini) · $0.0018 / 22 s (gpt-5-nano) · code only $0 / 0.33 ms
- Model outputs rejected by the schema check: **0** (gpt-4.1-mini), **2** (gpt-5-nano)
- Live: ingest → receipt **p50 15 ms**. Built-in agent on gpt-4.1-mini: 2 of 6 approvals flagged (stale cache), about $0.0011 per request.

**Caveat to say out loud:** the free-text notes come from the same generator's templates, so 100% recall shows the pipeline works, not how it would score on messy real logs.
