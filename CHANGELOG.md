# Changelog

All notable changes to the VELoop CAPTCHA Earn module.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - 2026-09-26

### Added
- Live threat monitor at `/security`, rendering the append-only audit log in
  real time so blocked attacks are observable rather than merely claimed.
- Adaptive difficulty across three levels, derived server-side from the
  user's own solve streak. Option composition is unchanged, so the spec's
  1 correct + 2 similar + 1 different structure holds at every level.
- `GET /api/captcha/history`, `GET /api/captcha/config`,
  `GET /api/wallet/gems` and `GET /api/wallet/transactions`.
- `AuditLog` model recording every blocked attempt.
- `rewardStatus` lifecycle: `PENDING -> CLAIMED | FORFEIT`.
- `source` field on `GemTransaction`.
- CI workflow running the test suite and a production build on every push,
  against a real MongoDB service container.
- Deployment guide covering MongoDB Atlas, Render and Vercel/Netlify.

### Fixed
- **Double spend.** The wallet was credited before the challenge was
  claimed, so a request that lost the compare-and-swap still kept the
  reward. The claim now happens first.
- **Silent reward loss.** Combining `$inc` with `setDefaultsOnInsert` in a
  single upsert can apply the default after the increment, discarding the
  reward for users without an existing wallet. Split into ensure-then-increment.
- **Broken result screen.** `ResultModal` used `<Sparkles />` after the
  name had been removed from its import list. The bundler did not catch
  it, so the component threw at runtime and rendered a blank page.
- **Unsigned refreshed challenge.** An already-open challenge returned from
  `GET /captcha/current` had no signature, so a page refresh produced a
  challenge the client could never submit.
- **Cross-user data leak in the audit trail.** A cross-user access attempt
  recorded the victim's challenge ID into the attacker's own feed.
- **SPA routing.** Added `vercel.json` and `public/_redirects` so client
  routes survive a refresh on either host.
- **Production API URL.** `VITE_API_BASE` never reached the deployed
  bundle; it is now loaded from `frontend/.env.production` at build time.

### Security
- HMAC binding of each challenge to its owner and expiry.
- Per-user rate limits on verify, claim and challenge issuance.
- 300 ms minimum human reaction time.
- CORS driven by `ALLOWED_ORIGINS` instead of reflecting any origin.

## [1.0.0] - 2026-09-26
- Initial implementation: models, controllers, routes, services, auth,
  rate limiting, and the five-state CAPTCHA earn flow.
