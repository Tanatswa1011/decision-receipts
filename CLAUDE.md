# Decision Receipts: project rules

## What this is
A prototype for Tanatswa's Langdock "Build Your Own Internship" application (a Loom of at most 5 min). Posting: https://jobs.ashbyhq.com/langdock/6e9e2672-851a-40e9-9c4e-0fb6cf351474

**One line:** every AI-agent decision gets a receipt that lists the facts it relied on, and **code (not a model)** checks each fact against the systems of record. Each fact is marked verified, contradicted (the source says otherwise) or unsupported (no source at all: a hallucination). A review queue is ranked by € at risk.

**Demo moment:** 20 procurement approvals, all green in the logs. Receipt #14 was approved on "supplier is ISO certified", but the supplier database shows the certificate expired 8 months ago. It gets flagged and goes to the top of the review queue.

## The bar
`docs/uniqueness-checklist.md` is the acceptance test. Before recording, every box must have proof (demo, code or a measured number). If any red flag in section F is true, we've built a wrapper, so stop and fix it.

## Origin and reuse
- Built on Tanatswa's own **ACPT / AI Mission Control** (solo entry at the Summer Up hackathon, CODE University Berlin, Aug 2026; repo `C:\Users\tanam\OneDrive\Desktop\AMC\ai-mission-control`, github.com/Tanatswa1011/ai-mission-control).
  - Reuse the deterministic verification core: `lib/verification/` (compare, evaluate, normalize, evidence-resolver, path-resolve) and `lib/contracts/workflow-*` (Zod).
  - Copy files in, record in README which files came from ACPT, and keep that history honest.
- **Do not** bring over Clerk, Neon or Supabase. The demo must run locally with no logins (checklist E6).
- **The lesson that shapes the product:** ACPT was pitched as "governance software for AI agents" and got no letters of intent. Lead with **money at risk**, not "governance".

## Hard rules
- **Synthetic data only.** Use a fictional company, suppliers and people. Never use kloeckner.i material, real brands or real people.
- **Truth comes from code.** The LLM only (a) splits an agent decision into atomic claims and (b) maps each claim to a claim type. Its output is schema-validated, and invalid output is rejected and counted.
- Every verdict must link to an evidence ID that exists. Unknown citations get flagged.
- The model is configurable through an OpenAI-compatible base URL (`OPENAI_BASE_URL`). Built and tested on OpenAI; Langdock is **untested**, so say so.
- Secrets live only in `.env` (git-ignored). Never print, log or commit keys.
- **BUILD_LOG.md:** add a dated entry whenever something breaks or a design decision changes. This becomes the honest "what broke" section of the Loom. Never invent entries.
- Measure, don't estimate: precision/recall on the labelled set, risk-queue vs random baseline, cost and latency per decision. Fill in the numbers section of the checklist only from real runs.
- No pushing to GitHub, no publishing and no installing new global tools without Tanatswa's OK. Local `npm install` of project dependencies is fine once the stack is agreed.

## Claims Tanatswa may make (from the job-search profile)
- CS graduate; kloeckner.i Working Student Data Quality (Apr 2024 – Jul 2025): ground-truth labelling, validation rules, bug triage. Describe it only in general terms.
- MeetNimo: working MVP / iOS alpha with grounding and prompt-injection tests, **not launched**.
- n8n AI invoice agent; ASK DAA CSV profiler. Prototypes, never "production".
