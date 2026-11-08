# Loom cue card (keep beside the screen)

**Before:** `npm run dev` → `npm run demo:prep -- --with-agent` → browser 110% → header **Live** + **AI off** → Cursor on `verify.ts` + `evaluate.ts`.

| Time | Click | Say (keywords) |
|---|---|---|
| **0:00** | Live feed, all "✓ success" | Companies' own agents on Langdock approve POs · logs say *success* ≠ true facts · today found at **month-end close**, money gone · hackathon lesson (your words) → **money at risk, checked at decision time** |
| **0:40** | **#14** | €8,400 · "ISO certified" · supplier DB: **expired 8 months earlier** · contradicted |
| 0:55 | Evidence chip **SUP-104** → back | Every verdict cites a record. No record, no "verified" |
| 1:10 | Header **AI off ↔ gpt-4.1-mini** | Still flagged → a date check against the record, not a model's opinion |
| 1:25 | **#22** | Cites CTR-2026-099 → **doesn't exist** → "no source" ≠ "source says otherwise" |
| 1:45 | **#19** | Two orders, 32 h, each under €10k → **split order**, only visible across decisions |
| 2:00 | *(optional)* agent receipt **PO-4601** → Run timeline | Live telemetry from a real GPT-4.1-mini agent · it **saw** "certified" (stale cache), the **record** says expired |
| 2:20 | **Review queue** | Ranked by € · first 10 reviews: **10 of 10 bad** · random: **< 3** |
| **2:35** | README diagram → `verify.ts` → `evaluate.ts` | Events in → model only splits text into claims (Zod, quote must exist) → ACPT verifier, unchanged → receipt → queue · AI off **12/16**, AI on **16/16** · **$0.0006**/decision |
| **3:25** | `BUILD_LOG.md` | 1) my answer key was wrong (2 accidental splits + #12 €18.5k over the limit, a rule I hadn't checked) 2) same-day expiry needed inclusive dates 3) cheap reasoning model: invalid output ×2, rejected not passed through, 11× slower · caveat: template notes, real logs next |
| **4:05** | Settings → provider list | Next: **read-only connections** to a customer's real ERP / suppliers / contracts · same code · **records never go to the model** · "couldn't find this in your docs as of 7 Nov" · test with 2–3 customers' logs · **Audit Logs / Agent API** → receipts → **Governance API** flag/pause · any provider, Langdock base URL **untested** |
| **4:55** | stop | "That's the internship I'd like to build." |

**Over 4:50 in rehearsal?** Cut the optional agent beat first, then the evidence click.
**Never say:** "Langdock lacks this", "production", "tested on Langdock", "connects to real databases", "customers use it", real company or kloeckner.i names.
**Default:** skip the optional agent beat unless rehearsal is under 4:40.
