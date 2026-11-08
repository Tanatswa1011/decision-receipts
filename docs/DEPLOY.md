# Deploy the public demo (Vercel)

**Live:** https://decision-receipts-seven.vercel.app (deployed 8 Nov 2026 via Option A from the private repo Tanatswa1011/decision-receipts; checked: all 9 routes 200, stats match the Loom, ingest 403).

The hosted copy is a **read-only demo** so reviewers can click through it safely. It is switched on by one environment variable:

```
DR_PUBLIC_DEMO=1
```

With it set:
- Pages read the committed synthetic data (`data/`), saved model runs (`runs/*.json`) and a snapshot of a real local replay plus built-in agent run (`data/live-snapshot/`). The app opens on that live feed, as in the Loom.
- The header switch AI off ↔ gpt-4.1-mini ↔ gpt-5-nano shows the **saved** results. No model is called.
- Turned off: saving or testing keys, model runs, agent runs, replay, reset, ingest-key rotation. `POST /api/events` returns `403 read_only_demo`.
- Settings shows the supported providers (Langdock marked UNTESTED) instead of key fields, so nobody can paste a key into the public site.
- **Never add API keys to the Vercel project.** None are needed.

Checked locally on 8 Nov 2026 with `DR_PUBLIC_DEMO=1 next build && next start`: every page returns 200, the stats match the Loom (AI off 14 flagged / 12 unchecked; gpt-4.1-mini 18 / 0), ingest returns 403, and nothing is written to disk.

## Option A: GitHub + Vercel (recommended, auto-redeploys)
1. Create an empty GitHub repo (private is fine), e.g. `decision-receipts`.
2. Push: `git remote add origin https://github.com/<you>/decision-receipts.git` then `git push -u origin master`.
3. vercel.com → Add New → Project → import the repo. Framework: Next.js (detected). Build command and output: defaults.
4. Environment Variables → add `DR_PUBLIC_DEMO` = `1` (Production and Preview).
5. Deploy. Open the URL and check `/`, `/receipt/14`, `/queue`, `/metrics`, `/settings`.

## Option B: Vercel CLI, no GitHub
1. `npx vercel login` (opens the browser; nothing is installed globally).
2. From the repo folder: `npx vercel --prod -e DR_PUBLIC_DEMO=1 -b DR_PUBLIC_DEMO=1`
3. Answer the prompts (new project, defaults). The CLI prints the URL.

## After deploying
- Add the URL to the README and your Langdock submission next to the Loom link.
- The local app is unchanged: without `DR_PUBLIC_DEMO`, everything (keys, agent, replay, ingest) works as before.
