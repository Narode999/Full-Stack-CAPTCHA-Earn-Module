# Security Model

**Zero-frontend-trust.** The client is assumed hostile. It may inspect and edit
every variable it holds; none of that is allowed to change an outcome.

This system is **not** claimed to be 100% fraud-proof. It raises the cost of
automation to the point where scripted farming is not worthwhile, and makes
every reward a server-authoritative, auditable, single-payout event.

---

## 1. The answer never crosses the wire

`correctOption` is protected by **three independent barriers**:

1. **Schema projection** — `select: false`, so it is absent from every query
   result unless explicitly re-selected (which happens only in the verify path).
2. **Schema `toJSON` transform** — deletes the key even if a caller forgets the
   projection.
3. **Explicit payload builder** — `toPublicChallenge()` enumerates the only
   fields that may be sent. Nothing is passed through implicitly.

A client that never solves a puzzle is still just guessing at four strings.

## 2. The client cannot dictate the outcome

Request bodies are **whitelisted**. Any attempt to send `isCorrect`, `reward`,
`newBalance`, `gemBalance`, `type`, `userId`, … is rejected outright:

```json
{
  "success": false,
  "code": "CLIENT_OVERRIDE_REJECTED",
  "rejectedFields": ["isCorrect", "reward"],
  "auditFlag": "REWARD_INJECTION_ATTEMPT"
}
```

The response names the offending fields so the rejection is loud rather than silent.

## 3. Replay is impossible

A challenge transitions `ACTIVE → COMPLETED` via a **compare-and-swap**:

```js
findOneAndUpdate({ _id, status: 'ACTIVE', expiresAt: { $gt: now } },
                 { $set: { status: 'COMPLETED', ... } })
```

Only the request that actually flips the status may proceed to record a reward.
A second `POST /verify` matches nothing and gets `409`.

## 4. No double spend, under real concurrency

Tested, not assumed. Six parallel `POST /verify` on one challenge:

```
winners = 1   →  [200, 409, 409, 409, 409, 409]
balance delta = exactly 1.0
```

## 5. Claims pay exactly once

`rewardStatus` moves `PENDING → CLAIMED` by compare-and-swap. Five parallel
`POST /claim` calls:

```
winners = 1  →  1×200, 4×409 ALREADY_CLAIMED
ledger rows  = 1
```

`GemTransaction.referenceId` is **unique**, so even a logic bug could not
produce a second ledger entry for one challenge.

## 6. Cross-user access is not merely forbidden — it is invisible

Every challenge query is scoped by `userId`, derived from the JWT. Another
account's challenge returns `404`, not `403`, so the endpoint cannot be used to
probe which challenge IDs exist. A `?userId=` query parameter is ignored.

## 7. Replay across accounts is blocked by HMAC

Each challenge is signed with `HMAC-SHA256(challengeId + userId + expiresAt)`
using `SERVER_SECRET`, re-verified server-side on every submission. A signature
is useless to another account and expires with the challenge.

## 8. The ledger cannot be poisoned

- `GemTransaction.amount` is enum-constrained to `[1, 0.5]`.
- `CaptchaChallenge.rewardAmount` is enum-constrained to `[0, 1, 0.5]`.
- Reward values live in a frozen config module, never in React.

## 9. Abuse controls

| Control | Value |
| --- | --- |
| Rate limit `/verify` | 20 / min / user |
| Rate limit `/new` | 30 / min / user |
| Rate limit `/claim` | 20 / min / user |
| Human reaction floor | 300 ms (below → `BOT_SUSPECTED`) |
| Open challenges per user | 1 (issuing a new one discards the old) |
| Challenge TTL | 2 minutes |

## 10. Cryptographic randomness

Challenge text and distractors use `crypto.randomInt`, never `Math.random`.
Distractors are single-character confusables drawn from a curated map, so the
wrong answers stay genuinely hard without being absurd.

## 11. Audit trail

`AuditLog` records `CHALLENGE_ISSUED`, `CHALLENGE_VERIFIED`, `REWARD_CLAIMED`,
`REWARD_FORFEITED`, and the blocked variants, with outcome and IP. Auditing is
best-effort and can never fail the request it describes.

---

## Two bugs this project exists to avoid

**Credit-before-claim.** The original code credited the wallet *before* claiming
the challenge, so a request that lost the CAS still kept the reward. Fixed by
claiming first.

**`$inc` + `setDefaultsOnInsert` in one upsert.** For a user with no wallet row,
MongoDB may apply `$setOnInsert` *after* `$inc`, silently discarding the reward
(balance stuck at the default). Fixed by splitting into ensure-then-`$inc` in
`wallet.service.creditGems`. Both are covered by tests.

---

## Reporting

Security-relevant events are queryable in the `auditlogs` collection. For a
private deployment, add HTTPS, rotate `JWT_SECRET`/`SERVER_SECRET`, and move to
MongoDB Atlas.
