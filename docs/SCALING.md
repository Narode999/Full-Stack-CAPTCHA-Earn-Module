# Scaling VELoop Rewards to 100,000 CAPTCHA Attempts per Day

**Assignment section 96.** This is not a list of scaling buzzwords; each section
describes what the current implementation already does, where it breaks first at
100,000 attempts/day, and what the next step is.

## 0. The actual load shape

100,000 attempts/day is **1.16 requests/second on average** — trivial. The number
that matters is the peak, not the mean. Real traffic is not uniform: a promotion
or a push notification can compress a day of attempts into ten minutes, which is
roughly 170 requests/second, a 150x burst.

So the scaling question is not "can the database take 1 rps?". It is:

> **Can a single, un-deduplicated replay of a verify request be made
> impossible, even at 170 concurrent writes per second against one document?**

That is the constraint the whole design is built around, and the reason the
answer is a compare-and-swap rather than a transaction.

## 1. MongoDB indexes

Every hot query in this module is already index-backed, and the index set was
chosen from the access patterns rather than added defensively.

| Query | Index used |
|---|---|
| `GET /captcha/current` — find the caller's open challenge | `{ userId: 1, status: 1, createdAt: -1 }` |
| `POST /verify` — load the challenge by id | `challengeId` (unique) |
| `POST /claim` — locate a pending reward | `{ isClaimed: 1, status: 1, updatedAt: 1 }` |
| `GET /history` — the caller's recent activity | `{ userId: 1, status: 1, createdAt: -1 }` |
| `GET /wallet/gems` | `wallets.userId` (unique) |
| `GET /security/threats` | `auditlogs.userId`, `auditlogs.createdAt` |

Two indexes are correctness guarantees rather than performance tuning:

- **`gemtransactions.referenceId` is UNIQUE.** This is what makes duplicate
  rewards structurally impossible. If two claim requests somehow both passed the
  status check, the second insert fails with a duplicate-key error and is rolled
  back. The database is the last line of defence, not the application.
- **`wallets.userId` is UNIQUE**, so a user can never end up with two wallets
  and a split balance.

**At scale:** the compound index `{ isClaimed, status, updatedAt }` grows without
bound. Once challenges past 30 days can no longer be claimed, it should be
converted to a partial index scoped to unclaimed documents only:

```js
// Only unclaimed challenges are ever looked up this way.
{ isClaimed: 1, status: 1, updatedAt: 1 }
  .partialFilterExpression({ isClaimed: false })
```

That keeps the hot index proportional to *outstanding* challenges rather than to
lifetime challenges, which is the difference between a 2GB index and a 20MB one
after a year.

## 2. Atomic updates and why transactions were rejected

The reward path is a **single-document compare-and-swap**, not a multi-document
transaction:

```js
const settled = await CaptchaChallenge.findOneAndUpdate(
  { _id, status: 'ACTIVE', expiresAt: { $gt: new Date() } },
  { $set: { status: 'COMPLETED', result, rewardStatus: 'PENDING', ... } },
  { new: true }
);

if (!settled) {
  // Another request already settled this challenge. This one is a loser.
}
```

MongoDB guarantees single-document atomicity, so this entire step either applies
or does not. There is no window in which a challenge is both `ACTIVE` and
`COMPLETED`.

**Why not a multi-document transaction?** An earlier version of this codebase
credited the wallet *before* claiming the reward. Wrapping the credit and the
claim in a transaction fixed the ordering, but the design was still wrong: it made
a hot shared document (`Wallet`) part of every contention domain. Two users
claiming at the same instant would contend on the same wallet document, and
under load that becomes a throughput ceiling for reasons that have nothing to do
with correctness.

The fix was to **invert the order**: claim first, credit second. The claim is a
`CAS` on the challenge. Only the single winner proceeds to touch the wallet, so
contention on the wallet drops to exactly one write per real reward. `findOneAndUpdate`
returns the post-image, and that post-image is the authoritative balance — the
client is never asked to compute it.

**At scale:** the wallet is now the hottest document in the system, because every
reward is a `$inc` on it. The `$inc` is a single atomic update, so it does not
lock for long, but it is still a serialization point. Sharding wallets across
users is impossible (it would break the balance), so the scale answer is to
**partition by time** instead — see reconciliation in section 12.

## 3. Idempotency

Idempotency is enforced at four independent layers, so a failure at any one of
them is not a double-spend:

1. **Challenge status.** `ACTIVE -> COMPLETED` via CAS. A second `POST /verify`
   finds no `ACTIVE` document and returns `CHALLENGE_ALREADY_COMPLETED`.
2. **Reward status.** `PENDING -> CLAIMED` via CAS. A second `POST /claim`
   returns `REWARD_ALREADY_CLAIMED`.
3. **Unique ledger index.** `gemtransactions.referenceId` is unique, so even if
   layers 1 and 2 both failed, the duplicate insert cannot commit.
4. **Replay signature.** Each challenge carries
   `HMAC-SHA256(challengeId + userId + expiresAt)`. It is re-verified
   server-side on every submission, so a signature captured from one account is
   useless against another, and it dies with the challenge.

This is verified, not asserted. `tests/security.test.js` fires **six parallel
`POST /verify` requests at a single challenge** and asserts the balance moves by
exactly one reward, and separately fires parallel claims and asserts exactly one
credits. Passing 6x is evidence; reasoning about 6x is not.

**At scale:** if request volume makes retries common, add an explicit
`Idempotency-Key` header per client, stored in Redis with a 24-hour TTL, and
return the original response for a repeat. The four layers above make that an
optimisation for cost, not a correctness requirement.

## 4. Rate limiting and abuse control

Current per-user limits: **20 verifies/min, 30 challenge issues/min, 20
claims/min**, plus a **300 ms minimum human-reaction floor** and a
single-`ACTIVE`-challenge-per-user invariant (issuing a new challenge discards
any still-open one).

Per-user limiting is necessary but not sufficient, because it assumes the user
identity is honest. Identity is derived from the JWT on every request and is
never taken from a body parameter, so it is about as trustworthy as the signing
secret.

**At scale, rate limiting becomes a three-tier system:**

| Tier | Key | Purpose |
|---|---|---|
| Edge / CDN | IP + ASN | Absorb volumetric abuse before it reaches Node |
| Application | `userId` | Fair-use limits, already implemented |
| Risk | Behavioural fingerprint | Detect one account operating many identities |

The middle tier must move to **Redis**. In-process limiting is per-instance, so
three API instances means three separate buckets and the effective limit is
triple what was intended. Redis gives one shared counter:

```
INCR rate:{userId}:verify:{minuteBucket}
EXPIRE rate:{userId}:verify:{minuteBucket} 120
```

Token-bucket rather than fixed-window, because a fixed window lets a user spend
their whole quota at 10:00:59 and again at 10:01:00 — 2x burst at the boundary.

## 5. Challenge expiry

Expiry is enforced **server-side on every read**, not by a cleanup job:

```js
{ _id, status: 'ACTIVE', expiresAt: { $gt: new Date() } }
```

A challenge whose TTL has passed simply does not match, regardless of what its
`status` field still says. This is deliberate: expiry is a predicate on the
write, so it cannot be bypassed by a document that a background job failed to
sweep. TTL adapts to difficulty — 120s standard, 90s sharp, 60s elite.

`expiresAt` already carries a plain B-tree index, so a **TTL index** is the
natural addition:

```js
CaptchaChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
```

A one-hour grace period sweeps abandoned challenges cheaply. Correctness does not
depend on it; it just keeps the collection small.

**Do not shorten TTL to control cost.** The TTL is an anti-brute-force control.
The correct cost control is rate limiting, which limits *volume*. TTL limits
*window size*. Confusing the two means either paying for unbounded storage or
giving an attacker an infinite guessing window inside a long-lived challenge.

## 6. Redis, and where it is genuinely worth it

Redis is worth adding in four places, and it is worth **not** adding it in most
others.

**Worth it:**

- **Shared rate-limit counters** (above) — correctness of the limit, not speed.
- **Challenge-issue cache**, `GET /captcha/current` is the hottest read and is
  per-user and short-lived. A short TTL cache absorbs page-refresh traffic
  cheaply, because the challenge is already immutable once issued.
- **Idempotency keys** for client retries.
- **Short-lived risk counters** — "17 failed verifications in 60s across 4
  challenges" needs a sliding window, which is awkward in MongoDB and trivial in
  Redis.

**Not worth it:**

- **The wallet balance.** A cache in front of the authoritative balance creates
  a window where the UI shows a stale number, which is exactly the class of bug
  this whole project exists to prevent. The balance is one indexed single
  document read; it is not the bottleneck.
- **The unique constraint on `referenceId`.** Redis cannot provide a durable
  unique index. Moving that guarantee out of MongoDB would trade a hard
  correctness property for a cache that can be evicted.

## 7. Queue architecture

The synchronous path (verify, claim) must stay synchronous — the user is waiting
on the reward, and making it async would mean a pending state the client cannot
trust.

Move to a queue only what is **not on the user's critical path**:

| Work | Queue | Why |
|---|---|---|
| Audit log writes | Yes | Append-only, never read on the hot path |
| Reward reconciliation | Yes | Nightly, already batch-shaped |
| Risk scoring / behavioural aggregation | Yes | Needs a window of many events |
| Notification / push | Yes | Pure side effect |
| Wallet credit | **No** | Must be synchronous and atomic |
| Verify / claim CAS | **No** | Must be synchronous and atomic |

Implementation: **BullMQ on Redis**, which gives retries with backoff, delayed
jobs, and a dead-letter queue. At-least-once delivery, so every consumer must be
idempotent — the audit-log writer de-duplicates on `(userId, challengeId,
event)` for exactly this reason.

## 8. Fraud and risk signals

The existing audit log already records the events that matter: invalid payloads,
replayed signatures, cross-user access, expired submissions, duplicate claims.
Those are the raw material. At scale they become signals, not just logs.

Signals worth computing, cheapest first:

1. **Velocity** — issues per minute vs the user's own 30-day baseline. A user
   moving from 2/day to 200/day is a stronger signal than any absolute threshold.
2. **Correct rate** — a human solving text CAPTCHAs is well below 100%. A
   session at 95%+ is either a solved captcha service or a scripted replay.
3. **Distinct-IP count per account per hour** — cheap, and hard to evade without
   a large proxy pool.
4. **Cross-account signature reuse** — the same HMAC presented by two userIds is
   a definitive replay and should be a hard block plus an alert.
5. **Reclaim rate** — claim rate divided by verify rate. Legitimate users claim;
   a farming script often ignores the reward.

**The honest position**, which section 49 of the assignment explicitly asks for,
is that this is not "100% fraud-proof". These signals raise cost and reduce yield.
A determined attacker with a captcha-solving service and residential proxies will
still clear a correct rate of 1 against a text challenge. The realistic goal is
that farming is **uneconomical**, and that any single attacker cannot extract at
scale without tripping a signal. Layered defence, not a single unbreakable
control.

## 9. Database scaling

100,000 challenges/day is roughly 100,000 documents/day, or 36 million/year. Small
for MongoDB, but `captchachallenges` grows fastest and has the shortest useful
life.

In rough order of when each becomes necessary:

1. **Now — index tuning and `explain()`.** The compound indexes above cover every
   hot query. Verify with `explain("executionStats")` that no query is
   collection-scanning.
2. **Soon — TTL sweep** on `expiresAt` (section 5), and archive
   `COMPLETED` challenges older than 90 days to cold storage or S3. History
   pages only ever read recent activity.
3. **Then — read replicas.** `GET /history`, `GET /security/threats`, and
   dashboard aggregates are all read-only and can go to a replica. Writes stay on
   the primary. Ensure read preference is `primary` for verify and claim — a
   replica lag could otherwise return a stale `ACTIVE` status and cause a
   spurious `CHALLENGE_ALREADY_COMPLETED`.
4. **Later — sharding.** If ever needed, shard `captchachallenges` and
   `auditlogs` on `userId`, which is already the primary access path. **Never
   shard `wallets`** — it would break the single-document atomicity that the
   entire reward guarantee depends on.

Replica-set read/write split is the correct next step long before sharding, and
sharding on a workload this size would be a mistake.

## 10. API scaling

The Node layer is stateless, so it scales horizontally today, with one
correction: the in-process rate limiter must move to Redis (section 4) or limits
become per-instance.

Beyond that:

- **Keep the API layer thin.** All correctness lives in the compare-and-swap and
  the unique index, both of which are database guarantees. That means API
  instances are trivially stateless and can be scaled on CPU with no coordination.
- **Long-lived connections** — use a driver connection pool sized to the
  instance count, and enable retryable writes so a failover mid-CAS retries
  safely. The CAS is idempotent: re-running a `findOneAndUpdate` whose condition
  no longer matches is a no-op, not a second credit.
- **Cache the reward config** (`GET /captcha/config`) in memory with a short
  TTL plus a version bump to invalidate. It is read on nearly every page load and
  changes rarely.
- **Horizontal scale the API before touching the database.** With an average of
  1.16 rps, several small instances will absorb any realistic peak. The database
  is the scarce resource and should be the last thing to scale.

## 11. Monitoring

Consistency is easy to assert in a test and easy to lose in production. These
signals are what tell you a race has started.

**Correctness alarms (page immediately):**

- **Ledger-vs-wallet drift.** A nightly job recomputes
  `sum(gemtransactions.amount) per user` and compares to `wallets.lifetimeEarned`.
  Any non-zero drift is a correctness bug, not a rounding issue. This is the
  single most valuable alarm in the system.
- **Any `referenceId` duplicate-key error.** It should be impossible; seeing one
  means a control was bypassed.
- **Wallet `$inc` failures.** A failed increment means a reward was recorded as
  claimed but never paid.

**Operational alarms:**

- p95 and p99 latency on verify and claim, separately — a p99 that diverges from
  p95 usually means lock contention on the wallet document.
- CAS loss rate: `verify requests - challenges settled`. A rising ratio means
  clients are double-submitting, which is a client bug or an attack.
- Rate-limit rejection rate per user and per IP.
- Expiry rate. A jump means either a latency problem or a bot sweeping.

**Business metrics:** gems issued per day, average correct rate, and gems issued
per active user. A sudden rise in gems issued with a flat user count is the
clearest available signal that something is being farmed.

## 12. Reward reconciliation

Reconciliation is what makes the guarantees above durable rather than merely
intended. Run nightly:

1. For each user, sum `GemTransaction.amount` where `status: 'COMPLETED'`.
2. Compare against `Wallet.lifetimeEarned`.
3. Compare `Wallet.gemBalance` against its own transaction history.
4. Investigate every difference. **Do not auto-correct.** An automatic repair
   hides the bug that produced the drift, and that bug is the thing that matters.

Two durable invariants to assert:

- `count(GemTransaction where referenceId = X) <= 1` — enforced by the unique
  index, verified nightly as proof the index still exists.
- No challenge is `COMPLETED` with `rewardStatus: 'PENDING'` older than 24 hours.
  A stuck `PENDING` is either a lost claim or a dead worker, and it is a user
  who was not paid.

Over time, build a **materialized daily ledger snapshot** so reconciliation
compares two aggregates rather than rescanning a growing collection. Once
`gemtransactions` is in the hundreds of millions, the nightly full sum becomes
too slow to run; incremental snapshots partitioned by month make it O(new data).

## Summary

The load at 100,000 attempts/day is not the hard part. The hard part is that a
reward must be issued **exactly once** under concurrent retry, and that property
is already enforced by three independent database guarantees rather than by
application logic:

1. `ACTIVE -> COMPLETED` compare-and-swap on the challenge
2. `PENDING -> CLAIMED` compare-and-swap before the credit
3. A unique index on `gemTransaction.referenceId`

An application bug, a retry, and a parallel request all fail against those
controls. The scaling work that follows is therefore ordinary: shared rate
limiting, replica reads, archiving cold challenges, and a nightly reconciliation
job that proves the invariants still hold.

The one thing that must never change: **the reward decision stays on the server,
and the wallet is a single atomically-updated document.** Every scaling shortcut
that would trade either of those for throughput is the wrong trade.