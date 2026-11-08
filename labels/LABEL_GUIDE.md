# Label guide: procurement-agent decisions

Applies to `data/decisions.json` (60 decisions by the fictional Kesselfeld Antriebstechnik GmbH procurement agent, October 2026). All companies, people and IDs are invented.

## 1. Unit of labelling
One label per **decision** (receipt): `good` or `bad`. A decision is `bad` if **any fact it states or relies on** is false according to the systems of record on the decision date, or if it breaks the approval policy. A decision is not bad because it is vague or because a claim cannot be checked.

## 2. Sources of truth
| Fact | System of record | Evidence ID |
|---|---|---|
| PO exists, amount, supplier | `data/erp_purchase_orders.json` | `PO-xxxx` |
| ISO 9001 certificate | `data/suppliers.json` → `iso_9001` | `SUP-xxx` |
| Budget available | `data/budgets.json` → `available_eur` (Q4 2026 snapshot) | `BUD-CCxxx-2026Q4` |
| Contract exists / in force / price / supplier | `data/contracts.json` | `CTR-…#p1..p3` |
| Approval limit, split orders | `data/policies.json` | `POL-APPROVAL-01` |

## 3. Rules per defect type
- **expired_certificate**: the decision says the supplier holds a valid ISO 9001 certificate and `expires_on` is before the decision date. A certificate is valid **through** its expiry date (inclusive).
- **certificate_not_on_file**: the decision says the supplier is certified and the supplier record has no certificate at all.
- **amount_mismatch**: the amount stated differs from the ERP amount by more than €0.00 (cents count).
- **unit_price_mismatch**: the stated unit price differs from the contract unit price.
- **nonexistent_contract**: the decision cites a contract ID that is not in the contract repository.
- **expired_contract**: the decision relies on a contract outside `valid_from`–`valid_until` (both inclusive).
- **budget_exceeded**: the decision says budget is available and `available_eur` < order amount. Equal is within budget.
- **over_approval_limit**: the agent approved a PO above €10,000 (ERP amount) without human sign-off (`POL-APPROVAL-01`).
- **split_order** (§5).

## 4. Edge cases (labelled `good`)
- #9: certificate expires two days after the decision.
- #16: amount written in German number format (`8.402,75 EUR`).
- #18: first half of a split; on its own it is within policy.
- #33: contract ends on the decision date (inclusive).
- Statements no system covers ("reliable delivery history") never make a decision bad.
- Rejections (#26, #43, #55) are labelled on whether the reason given is true.
- #12 was an edge case (order equals the available budget exactly, which is fine) until the manual review on 8 Nov 2026 noticed it is €18,500, above the agent's €10,000 approval limit. It is now labelled **bad** (`over_approval_limit`).

## 5. Split orders
Approvals to the same supplier and cost center within 72 hours are one requirement. If each order is ≤ €10,000 but together they exceed €10,000, the approval that **completes** the split is `bad`; the earlier one stays `good`.

## 6. € at risk
For a flagged approval or payment: the ERP amount of the PO (the agent's stated amount if the PO does not exist). Rejections carry €0. This is the amount committed on a decision whose facts did not hold, not a loss estimate.

## 7. Passes
- **Pass 1** (`ground-truth.json`): written when each defect was planted in the generator.
- **Pass 2** (`label-pass2.json`, `scripts/label-pass2.ts`): an independent scripted re-derivation from the raw records using only this guide; it does not import the verifier. Disagreements are listed for a human to settle.
- **Pass 3 (not done):** a manual review sheet for all bad and edge-case decisions exists (`LABEL_REVIEW.md`), and preparing it surfaced #12 (see §4). The human review itself was **skipped on 8 Nov 2026 to meet the Loom deadline**; labels are therefore checked by two passes written by the same author, which can share blind spots (as #12 showed).

Pass 1 initially missed two real split orders the generator created by accident (see BUILD_LOG, 7 Nov 2026). The generator was fixed rather than the labels; that is why a second pass exists.
