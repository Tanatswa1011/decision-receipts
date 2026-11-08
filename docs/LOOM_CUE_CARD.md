# Loom cue card (keep beside the screen)

**Before:** `npm run dev` → `npm run demo:prep` → browser 110% → header **Live** + **AI off** → Cursor on `verify.ts`.

Times are at your reading pace (~95 words/min, 401 words ≈ 4:15 spoken + clicks).

| Time | Click | Say (keywords) |
|---|---|---|
| **0:00** | Live feed, ✓ Success | €8,400 approved · log says success · cert expired 8 months · **succeeded ≠ right** · catch at decision time, not month-end close · "That's why I built Decision Receipts" |
| **0:30** | **#14** | Claimed ISO 9001 · expired 8 months earlier · **Contradicted. €8,400 at risk.** |
| 0:45 | Evidence **SUP-104** | "Here's the evidence. No source, no verified decision." |
| 0:55 | **AI off** | Still flagged · **model doesn't decide what's true. Code does.** |
| 1:10 | **#22** | Contract doesn't exist · **unsupported, not contradicted** |
| 1:25 | **#19** | Same supplier, 32 h, each under €10k · split-order violation |
| 1:45 | **Review queue** | Ranked by money at risk · 60 synthetic · first 10 all bad · random < 3 |
| **2:05** | README diagram → `verify.ts` | One endpoint · AI extracts claims, invalid rejected · code checks synthetic records · **AI extracts, code verifies** · AI off 12/16, GPT-4.1-mini 16/16, ~$0.0006 |
| **2:40** | `BUILD_LOG.md` | 1) answer key missed €18.5k over limit 2) date boundary, same-day expiry 3) other model invalid ×2, schema rejected · **ground truth needs verification** · template notes, real logs next |
| **3:20** | Settings → Langdock (UNTESTED) | Read-only integrations · records stay outside the model · "couldn't find in public docs as of Nov 7" · test on real logs, Agent + Audit Logs APIs, pause high-risk actions · Langdock **untested** · **trust the decision, not just the run** |
| **4:15** | stop | "That's the internship I'd love to build." |

**Over 4:50?** Cut the evidence click first, then "Here's something more interesting".
**Never say:** "Langdock lacks this", "production", "tested on Langdock", "connects to real databases", "customers use it", real company or kloeckner.i names.
