# Testing

```bash
cd backend
npm test
```

Uses the built-in `node:test` runner plus `supertest`. Tests run against
**`TEST_MONGO_URI`** (a separate database) so a dev database is never touched.
MongoDB must be reachable.

```
tests 20 | pass 20 | fail 0
```

---

## Coverage

### Answer confidentiality
| Test | Asserts |
| --- | --- |
| a | `GET /current` never serialises `correctOption`; 4 unique options; the displayed code is among them |
| a2 | An **already-open** challenge is still signed and submittable (regression: a refresh used to hand back an unsigned challenge) |
| r | History is user-scoped, `?userId=` is ignored, and the answer is absent |

### Injection
| Test | Asserts |
| --- | --- |
| b | 8 different override fields each → `400 CLIENT_OVERRIDE_REJECTED`, no wallet created, challenge still open |

### Reward arithmetic
| Test | Asserts |
| --- | --- |
| c | Correct → `PENDING +1.0`; wallet unchanged until claim; after claim `125.50 → 126.50`; one ledger row with `source: CAPTCHA_EARN` |
| d | Wrong → `PENDING +0.5`; claim pays `126.00` from a fresh user |

### Replay & concurrency
| Test | Asserts |
| --- | --- |
| e | 3 replays → `409`; 2 parallel claims → exactly 1 success; 1 ledger row |
| f | 6 parallel verifies → exactly 1 winner; 5 parallel claims → exactly 1 success; balance moves by exactly one reward |
| n | 5 parallel claims → 1×`200`, 4×`409 ALREADY_CLAIMED`, 1 ledger row |

### Claim lifecycle
| Test | Asserts |
| --- | --- |
| o | Another user cannot claim your reward → `404`, owner's reward stays `PENDING` |
| p | An unverified challenge cannot be claimed → `409` |
| q | "No Thanks" forfeits permanently; a later claim → `409 REWARD_FORFEITED` |

### Challenge validity
| Test | Asserts |
| --- | --- |
| g | Expired → `410`, no wallet, status flips to `EXPIRED` |
| h | Cross-user solve → `404`; the owner's challenge remains solvable |
| i | Tampered signature → `403` |
| j | Option that was never offered → `400` |
| k | Answered faster than a human → `400 BOT_SUSPECTED` |
| m | A new challenge discards the old; only one `ACTIVE` per user |

### Auth & config
| Test | Asserts |
| --- | --- |
| l | Anonymous → `401 AUTH_REQUIRED`; forged token → `401 INVALID_TOKEN` |
| s | `/config` public; `/wallet/gems` requires auth |

---

## Verifying the database is real

```bash
cd backend
node scripts/verify-db.js
```

Prints live collection counts plus a sample challenge, wallet and transaction —
so an evaluator can confirm nothing is dummy data.

```bash
node seed/seed.js      # demo@veloop.test / Demo@12345, 100 gems
node scripts/fix-indexes.js   # one-off, safe to re-run
```

---

## Manual checks

```bash
# 1. Start backend + frontend, then open http://localhost:5173
# 2. Log in with the demo account.
# 3. Solve correctly  → result screen, reward is PENDING, balance unchanged.
# 4. Press "Claim Reward" → mock rewarded-ad beat → balance increases by 1.
# 5. Reload, check /history → the entry is marked Claimed.
# 6. Open DevTools → Network → replay the claim request. Second call returns
#    409 ALREADY_CLAIMED. The balance does not move.
```

## Not covered

- No load/performance testing.
- Rate limiter limits are verified by inspection, not by an automated burst test
  (the suite would need a dedicated limiter instance to avoid cross-test
  interference).
- Cross-browser visual testing.
