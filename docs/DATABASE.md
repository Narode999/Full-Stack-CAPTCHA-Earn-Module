# Database

MongoDB via Mongoose 8. Database: `veloop_rewards` (see `MONGO_URI`).

Seven collections were used by the codebase. Five are live; the two legacy
collections have been dropped (see "Legacy collections" below).

```
users                15
wallets               5
captchachallenges    19
gemtransactions      14
auditlogs             n
```

### Legacy collections (dropped)

`captchaattempts` and `captcharewardconfigs` came from an earlier schema
revision. Neither is referenced by any code here — attempts are recorded on the
challenge itself, and the reward table lives in `config/reward.config.js`.

```bash
node scripts/cleanup-collections.js   # drops both, safe to re-run
```

---

## Models

### User
| Field | Type | Notes |
| --- | --- | --- |
| `name` | String | required |
| `email` | String | required, **unique**, lowercased |
| `passwordHash` | String | bcrypt, cost 12 |
| `isActive` | Boolean | default `true` |

### Wallet
| Field | Type | Notes |
| --- | --- | --- |
| `userId` | ObjectId → User | required, **unique** |
| `gemBalance` | Number | default **125.50**, min 0 |
| `lifetimeEarned` | Number | default 125.50 |

### CaptchaChallenge
| Field | Type | Notes |
| --- | --- | --- |
| `challengeId` | String | required, **unique**, `ch_<uuid>` |
| `userId` | ObjectId → User | required |
| `captchaText` | String | the 6-char code shown to the user |
| `options` | [String] | exactly 4, validated |
| `correctOption` | String | **`select: false`** — the answer |
| `status` | String | `ACTIVE \| COMPLETED \| EXPIRED \| DISCARDED` |
| `expiresAt` | Date | issued + 2 minutes |
| `selectedOption` | String | `select: false`; recorded server-side |
| `result` | String | `CORRECT \| WRONG \| null` |
| `rewardAmount` | Number | enum `[0, 1, 0.5]` |
| `rewardStatus` | String | `PENDING \| CLAIMED \| FORFEIT` |
| `completedAt` / `claimedAt` | Date | audit timestamps |
| `isClaimed` | Boolean | legacy mirror of `rewardStatus` |

A `toJSON` transform deletes `correctOption` on every serialisation.

### GemTransaction
| Field | Type | Notes |
| --- | --- | --- |
| `transactionId` | String | **unique**, `txn_<uuid>` |
| `userId` | ObjectId → User | required |
| `amount` | Number | **enum `[1, 0.5]`** |
| `type` | String | `CAPTCHA_CORRECT \| CAPTCHA_WRONG` |
| `source` | String | `CAPTCHA_EARN` |
| `referenceId` | String | the `challengeId`, **unique** |
| `balanceBefore` / `balanceAfter` | Number | exact post-transaction figures |
| `status` | String | `COMPLETED \| FAILED` |

`referenceId` being unique is a database-level guarantee of **one reward per
challenge**.

### AuditLog
Append-only: `event`, `userId`, `challengeId`, `outcome` (`ALLOWED`/`BLOCKED`),
`detail`, `ip`, `createdAt`.

---

## Indexes

| Collection | Index |
| --- | --- |
| users | `email_1` (unique) |
| wallets | `userId_1` (unique) |
| captchachallenges | `challengeId_1` (unique), `userId_1`, `status_1`, `expiresAt_1`, `userId_1_status_1_createdAt_-1`, `isClaimed_1_status_1_updatedAt_1`, `rewardStatus_1` |
| gemtransactions | `transactionId_1` (unique), `referenceId_1` (unique), `userId_1`, `userId_1_createdAt_-1` |
| auditlogs | `event_1`, `userId_1`, `challengeId_1`, `createdAt_1` |

---

## Legacy index issue (already fixed)

This dev database carried a stale **unique index `user_1` on `wallets`** — a
field that no longer exists in the schema — with a legacy row holding
`user: null`. Every new wallet insert failed:

```
E11000 duplicate key error collection: veloop_rewards.wallets
index: user_1 dup key: { user: null }
```

`node scripts/fix-indexes.js` drops it and removes the orphaned document. It is
idempotent, so it is safe to re-run. If you import an old dump, run it once.

---

## State machine

```
        issue
          │
          ▼
      ┌──────────┐   expire    ┌─────────┐
      │  ACTIVE  │ ──────────► │ EXPIRED │
      └────┬─────┘             └─────────┘
           │  new challenge issued
           ▼
     ┌───────────┐
     │ DISCARDED │
     └───────────┘

   verify (CAS on ACTIVE)
          │
          ▼
    ┌───────────┐   claim (CAS on PENDING)   ┌─────────┐
    │ COMPLETED │ ─────────────────────────► │ CLAIMED │  → wallet credited
    │ PENDING   │                             └─────────┘
    └─────┬─────┘
          │  decline (CAS on PENDING)
          ▼
     ┌──────────┐
     │ FORFEIT  │  → can never be claimed
     └──────────┘
```

---

## Inspecting by hand

```js
// mongo shell
use veloop_rewards
db.captchachallenges.find().sort({ createdAt: -1 }).limit(3)
db.gemtransactions.find().sort({ createdAt: -1 })
db.wallets.find()
db.auditlogs.find().sort({ createdAt: -1 }).limit(20)
```

Or run `node scripts/verify-db.js`, which prints a formatted summary.
