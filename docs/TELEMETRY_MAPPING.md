# Telemetry → decision mapping

Decision Receipts accepts the same event contract as ACPT (`lib/contracts/ingest-event.ts`, copied unchanged from ACPT commit `759a874`) on `POST /api/events` with `Authorization: Bearer <ingest key>` (Settings → Sources).

| Status | Meaning |
|---|---|
| 201 | accepted (on `run.completed` the body also carries the receipt result) |
| 200 | duplicate `event_id`, ignored |
| 400 | body is not JSON or fails the schema |
| 401 | missing or wrong ingest key |

## Rules (code: `lib/live/adapter.ts`)
1. **One run = one decision.** Events are grouped by `external_run_id` and ordered by `sequence`.
2. **The decision step** is the `workflow.step.completed` event whose `action` is one of:
   | `action` | becomes |
   |---|---|
   | `po.approve` | `approve_po` |
   | `po.reject` | `reject_po` |
   | `payment.release` | `release_payment` |
3. **Structured fields** come from that step's `after_state`: `po_id`, `supplier_id`, `amount_eur` (or `amount`), `cost_center`, `contract_id`, `iso_certified`, `budget_available`. Keys are trimmed and lower-cased. Amounts may be numbers or strings (`"8400"`, `"8,400.00"`, `"8.400,00 EUR"`). If `po_id`, `supplier_id` or the amount is missing, the decision counts as free text only (unchecked with AI off).
4. **Free-text rationale** comes from the decision step's `risk_metadata.rationale`, or else from `run.completed`'s `risk_metadata.rationale`.
5. **What the agent saw:** every other completed step with a `resource_id` and an `after_state` (e.g. a `lookup_supplier` step for `SUP-104`) is stored as the agent's view of that record. The receipt shows it **next to** the system-of-record value, but the verdict comes only from the system of record. An agent that misread a record cannot mark its own homework.
6. **A receipt is built only after `run.completed`.**
   - A run with a `workflow.step.failed` is shown as a failed run, with no receipt.
   - A completed run with no decision action (e.g. `invoice.sent`) is shown as **"no checks defined for this action"**, never as verified.
7. **Decision date** = the decision step's `timestamp`. That is the date facts are checked "as of" (e.g. was the certificate valid that day).
8. Optional `risk_metadata` keys: `source` (`replay` | `live_agent`, anything else counts as `external`), `decision_id` and `receipt_no` (used by the replay so #14 stays #14).

## Example run (what the built-in agent sends)
```json
{"event_id":"run-7-started","event_type":"run.started","agent_id":"procure-agent-live","external_run_id":"run-7","sequence":0,"timestamp":"2026-11-08T10:00:00.000Z","status":"started","tool":null,"action":null,"resource_id":null,"before_state":null,"after_state":null,"risk_metadata":{"source":"live_agent"}}
{"event_id":"run-7-s1","event_type":"workflow.step.completed","agent_id":"procure-agent-live","external_run_id":"run-7","sequence":1,"timestamp":"…","status":"completed","tool":"supplier-cache","action":"lookup_supplier","resource_id":"SUP-104","before_state":null,"after_state":{"iso_certified":true,"cached_on":"2026-01-15"},"risk_metadata":{}}
{"event_id":"run-7-decision","event_type":"workflow.step.completed","agent_id":"procure-agent-live","external_run_id":"run-7","sequence":5,"timestamp":"…","status":"completed","tool":"procurement","action":"po.approve","resource_id":"PO-4601","before_state":null,"after_state":{"po_id":"PO-4601","supplier_id":"SUP-104","amount_eur":7800,"cost_center":"CC-410","contract_id":"CTR-2026-031","iso_certified":true,"budget_available":true},"risk_metadata":{"rationale":"…"}}
{"event_id":"run-7-completed","event_type":"run.completed","agent_id":"procure-agent-live","external_run_id":"run-7","sequence":6,"timestamp":"…","status":"completed","tool":null,"action":null,"resource_id":null,"before_state":null,"after_state":null,"risk_metadata":{}}
```
