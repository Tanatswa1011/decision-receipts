# Connect your own agent

Any tool that can send an HTTP POST can feed Decision Receipts. Contract and rules: [TELEMETRY_MAPPING.md](TELEMETRY_MAPPING.md).

- **Endpoint:** `http://127.0.0.1:3100/api/events` (local dev server)
- **Header:** `Authorization: Bearer <ingest key>` (Settings → Sources → Generate key)
- **Body:** one event per request. Send `run.started` → steps → `run.completed`.

> The app binds to 127.0.0.1. A cloud service (n8n Cloud, Langdock) cannot reach it without a tunnel you set up yourself; that is not part of this prototype.

## 1. curl (tested)
```bash
KEY=dr_live_...   # from Settings
U=http://127.0.0.1:3100/api/events
curl -X POST $U -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"event_id":"demo-1-started","event_type":"run.started","agent_id":"my-agent","external_run_id":"demo-1","sequence":0,"timestamp":"2026-11-08T10:00:00.000Z","status":"started","tool":null,"action":null,"resource_id":null,"before_state":null,"after_state":null,"risk_metadata":{}}'
curl -X POST $U -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"event_id":"demo-1-decision","event_type":"workflow.step.completed","agent_id":"my-agent","external_run_id":"demo-1","sequence":1,"timestamp":"2026-11-08T10:00:01.000Z","status":"completed","tool":"procurement","action":"po.approve","resource_id":"PO-4514","before_state":null,"after_state":{"po_id":"PO-4514","supplier_id":"SUP-104","amount_eur":8400,"cost_center":"CC-410","contract_id":"CTR-2026-031","iso_certified":true,"budget_available":true},"risk_metadata":{"rationale":"Supplier is ISO 9001 certified."}}'
curl -X POST $U -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"event_id":"demo-1-completed","event_type":"run.completed","agent_id":"my-agent","external_run_id":"demo-1","sequence":2,"timestamp":"2026-11-08T10:00:02.000Z","status":"completed","tool":null,"action":null,"resource_id":null,"before_state":null,"after_state":null,"risk_metadata":{}}'
```
The last response carries the receipt: `"receipt":{"status":"flagged","eur_at_risk":8400,…}`.

## 2. Self-hosted n8n (free Community Edition; not tested with this app)
Same pattern as the ACPT AI Invoice Agent workflow: an **HTTP Request** node after each step.
- Method `POST`, URL as above, header `Authorization: Bearer <key>`, body type JSON.
- Use `{{$execution.id}}` for `external_run_id` and as the `event_id` prefix, and `{{$now.toUTC().toISO()}}` for `timestamp`.
- The decision node's body: `"action": "po.approve"` and the PO fields in `after_state`.
- Tab-padded sheet headers and string amounts are fine; the adapter normalises them.

## 3. Langdock workflow (UNTESTED)
If a Langdock workflow has a step that can send an HTTP request, configure it like the n8n node above (POST, bearer header, JSON body). This has **not** been tried. It also needs the app reachable from Langdock's cloud. Treat it as a design note, not a supported integration.

## 4. Built in (tested)
- `npm run agent:replay`: the 60 synthetic decisions as telemetry, no key needed.
- `npm run agent:live`: the built-in tool-calling procurement agent (needs an LLM key in Settings).

Both are also buttons in Settings → Sources.
