# API Documentation

Base URL: `http://localhost:5000/api`

All `/captcha/*` and `/wallet/*` routes require `Authorization: Bearer <jwt>`,
except `GET /captcha/config` which is public (it exposes no secrets).

---

## Auth

### `POST /auth/register`

**Auth:** none · **Body:** `{ name, email, password }` (password ≥ 6 chars)

```json
{
  "success": true,
  "token": "eyJhbGciOi...",
  "user": { "id": "...", "name": "Demo User", "email": "demo@veloop.test" },
  "balance": 125.5
}
```

| Error | HTTP |
| --- | --- |
| `INVALID_INPUT` | 400 |
| `WEAK_PASSWORD` | 400 |
| `USER_EXISTS` | 409 |

### `POST /auth/login`

**Auth:** none · **Body:** `{ email, password }` → same response shape.
`INVALID_CREDENTIALS` (401) is returned for both a bad email and a bad
password, so the endpoint cannot be used to enumerate accounts.

---

## Captcha

### `GET /captcha/config`  *(public)*

Returns the live reward configuration. The frontend reads its reward copy from
here rather than hardcoding business values.

```json
{
  "success": true,
  "config": {
    "correctReward": 1, "wrongReward": 0.5, "currency": "GEMS",
    "optionCount": 4, "captchaLength": 6, "ttlMs": 120000, "active": true
  }
}
```

### `GET /captcha/current`

Returns the caller's live challenge, minting one if they have none.
**Validation:** none. **Response 200:**

```json
{
  "success": true,
  "challenge": {
    "challengeId": "ch_888dd660-...",
    "captchaText": "PTBBJP",
    "options": ["PTBBJP", "PFBBJP", "EKRQB5", "PTBPJP"],
    "expiresAt": "2026-09-25T14:06:43.000Z",
    "issuedAt": "2026-09-25T14:04:43.000Z",
    "signature": "9f2c...a71b"
  },
  "reward": { "correct": 1, "wrong": 0.5, "currency": "GEMS" }
}
```

> `correctOption` is **never** present. Three independent barriers enforce this:
> the schema `select: false`, a `toJSON` transform, and an explicit payload builder.

### `POST /captcha/new`  *(also `GET`)*

Discards any open challenge and issues a fresh one. **Rate limit:** 30/min/user.

### `POST /captcha/verify`

**Body — only these three fields are read:**
```json
{ "challengeId": "ch_...", "selectedOption": "PTBBJP", "signature": "9f2c..." }
```

Settles the challenge and records the reward as `PENDING`. **The wallet does not
change yet** — that happens on claim.

```json
{
  "success": true,
  "result": "CORRECT",
  "reward": { "amount": 1, "currency": "GEMS", "status": "PENDING" },
  "newBalance": 125.5,
  "balanceBefore": 125.5,
  "challengeId": "ch_...",
  "claimAvailable": true
}
```

| Error | HTTP | Meaning |
| --- | --- | --- |
| `CLIENT_OVERRIDE_REJECTED` | 400 | Client sent `isCorrect`/`reward`/etc. `rejectedFields` names them |
| `INVALID_INPUT` | 400 | Missing `challengeId`, `selectedOption` or `signature` |
| `INVALID_OPTION` | 400 | Selected option was never offered |
| `BOT_SUSPECTED` | 400 | Submitted faster than the 300 ms human floor |
| `INVALID_SIGNATURE` | 403 | HMAC did not verify |
| `CHALLENGE_NOT_FOUND` | 404 | No such challenge **for this user** |
| `CHALLENGE_ALREADY_COMPLETED` | 409 | Replay — nothing was paid |
| `CHALLENGE_EXPIRED` | 410 | Past its 2-minute TTL |
| `RATE_LIMITED` | 429 | > 20 verifies/min |

### `POST /captcha/claim`

**Body:** `{ "challengeId": "ch_..." }`

Pays the `PENDING` reward into the wallet exactly once. The `PENDING → CLAIMED`
transition is a compare-and-swap, so N parallel claims produce exactly one winner.

```json
{
  "success": true, "claimed": true,
  "reward": { "amount": 1, "currency": "GEMS", "status": "CLAIMED" },
  "balanceBefore": 125.5, "newBalance": 126.5,
  "challengeId": "ch_..."
}
```

| Error | HTTP |
| --- | --- |
| `CHALLENGE_NOT_FOUND` | 404 (not yours) |
| `CHALLENGE_NOT_COMPLETED` | 409 |
| `ALREADY_CLAIMED` | 409 |
| `REWARD_FORFEITED` | 409 |
| `RATE_LIMITED` | 429 |

### `POST /captcha/decline`

**Body:** `{ "challengeId": "ch_..." }` — the "No Thanks" path. Marks the reward
`FORFEIT` so it can never be claimed later. `REWARD_UNAVAILABLE` (409) if there
is nothing pending.

### `GET /captcha/history?limit=20`

The caller's own completed challenges. A `userId` query parameter is **ignored** —
identity comes from the JWT alone. `correctOption` is never selected.

```json
{
  "success": true, "count": 1,
  "history": [{
    "challengeId": "ch_...", "captchaText": "PTBBJP", "selectedOption": "PTBBJP",
    "result": "CORRECT", "rewardAmount": 1, "rewardStatus": "CLAIMED",
    "createdAt": "...", "completedAt": "...", "claimedAt": "..."
  }]
}
```

---

## Wallet

### `GET /wallet/gems`

The only authority for a balance.

```json
{ "success": true, "balance": 126.5, "lifetimeEarned": 126.5 }
```

### `GET /wallet/transactions?limit=20`

The caller's gem ledger, newest first.

### `GET /health`

`{ "status": "ok", "service": "VELoop Rewards API" }`
