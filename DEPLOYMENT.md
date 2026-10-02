# Deployment Guide

The project deploys as **three separate services**. Vercel cannot host the
Express API, and local MongoDB does not exist in the cloud.

| Piece | Service | Why |
| --- | --- | --- |
| React frontend | **Vercel** | Static build, free tier |
| Express API | **Render** or **Railway** | Needs a long-running Node process |
| Database | **MongoDB Atlas** | Free M0 cluster, connection string |

> **Do these in order.** Each step depends on the previous one.

---

## Step 0 — Prerequisites

- A GitHub account (you already have the repo pushed)
- Free accounts on Vercel, Render, and MongoDB Atlas
- Your code pushed to `main`

---

## Step 1 — Create the database (MongoDB Atlas)

1. Go to <https://www.mongodb.com/atlas> → sign up → **Create a deployment**
2. Choose the **free (M0) Shared** tier
3. **Database Access** → add a user:
   - Authentication method: *Password*
   - Username: `veloop`
   - Password: generate a strong one and **save it**
   - Privileges: *Read and write to any database*
4. **Network Access** → *Add IP Address* → **Allow access from anywhere**
   (`0.0.0.0/0`) — required because the Render service has no fixed IP
5. **Deployments** → *Database* → **Connect** → Drivers → **Node.js**
6. Copy the connection string, then **insert a database name** after the host:
   ```
   mongodb+srv://veloop:<password>@veloop.abcde.mongodb.net/veloop_rewards?retryWrites=true&w=majority
   ```
   That path segment is your database name.

---

## Step 2 — Generate real secrets

Run this **twice**. The two outputs must differ.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use one as `JWT_SECRET` and one as `SERVER_SECRET`. Never commit these.

---

## Step 3 — Deploy the API (Render)

1. <https://dashboard.render.com> → **New → Web Service** → connect the repo

2. Fill in:

   | Field | Value |
   | --- | --- |
   | Name | `veloop-api` |
   | Root Directory | `backend` |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance | Free |

3. **Environment** → add:

   ```
   MONGO_URI     = mongodb+srv://veloop:<password>@veloop.xxxx.mongodb.net/veloop_rewards?retryWrites=true&w=majority
   JWT_SECRET    = <first generated string>
   SERVER_SECRET = <second generated string>
   NODE_VERSION  = 20
   ```

   > Do **not** set `PORT`. Render injects it and `server.js` already
   > reads `process.env.PORT`.
   >
   > Leave `ALLOWED_ORIGINS` empty for now; add it in Step 5.

4. **Create Web Service** — first deploy takes 3–5 minutes. In **Logs** you
   want to see:
   ```
   MongoDB connected successfully
   VELoop Rewards API listening on http://localhost:10000
   ```

5. When it says **Live**, copy the URL, e.g. `https://veloop-api.onrender.com`

6. **Test in the browser:**
   ```
   https://veloop-api.onrender.com/api/health
   ```
   Expect:
   ```json
   { "status": "ok", "service": "VELoop Rewards API" }
   ```

7. **Optional** — seed the demo account from Render's **Shell** tab:
   ```bash
   node seed/seed.js
   ```

> **Free-tier note:** Render sleeps the service after 15 minutes idle and
> takes ~1 minute to wake. The first request after that is slow. It works.

---

## Step 4 — Deploy the frontend (Vercel)

1. <https://vercel.com> → **Add New → Project** → import the repo
2. Configure:

   | Field | Value |
   | --- | --- |
   | Project Name | `veloop-rewards` |
   | Framework Preset | Vite |
   | Root Directory | **`frontend`** |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

3. **Environment Variables** → add:

   ```
   VITE_API_BASE = https://veloop-api.onrender.com/api
   ```

   **This is the most important variable.** Without it the frontend falls
   back to `/api`, which does not exist in production.

   > Note the trailing `/api` — it is part of the URL.

4. **Deploy**

`frontend/vercel.json` is committed and handles the SPA rewrite, so
refreshing `/history` or `/security` will not 404.

---

## Step 5 — Lock down CORS

Render → your service → **Environment** → add:

```
ALLOWED_ORIGINS = https://full-stack-captcha-earn-module-jo6c.vercel.app
```

Save; Render redeploys automatically. Without it the API accepts requests
from any origin, which is worth fixing before a code review.

---

## Step 6 — Verify the live site

Open the Vercel URL and check:

- [ ] Login / register works
- [ ] A challenge appears with 4 options
- [ ] Selecting an option shows the scan, then **Verifying…**
- [ ] The **CORRECT / INCORRECT** result screen appears
- [ ] **Add to Balance** increases the header balance
- [ ] The back chevron reaches the dashboard
- [ ] `/history` shows past challenges
- [ ] `/security` shows the threat monitor
- [ ] Refreshing on `/history` does **not** 404

Then confirm the data really is in the cloud — temporarily point `MONGO_URI`
at your Atlas string and run:

```bash
node backend/scripts/verify-db.js
```

You should see the records the live site just created.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Cannot reach the VELoop server" | `VITE_API_BASE` missing/wrong | It must include the trailing `/api` |
| Blank page + CORS error in console | `ALLOWED_ORIGINS` wrong | Must match the Vercel URL exactly, no trailing `/` |
| 404 on `/history` refresh | Missing SPA rewrite | `frontend/vercel.json` must be committed |
| `ECONNREFUSED` | Backend asleep (free tier) | Wait ~1 min, reload |
| "MongoDB connected successfully" never appears | Bad `MONGO_URI` | Check password and the database name in the path |
| 500 on register | Secrets not set | Both `JWT_SECRET` and `SERVER_SECRET` required |
| Everything 404s | Wrong root directory on Render | Must be `backend` |

---

## Local development still works

Deployment does not change local development:

```bash
cd backend  && npm run dev    # :5000
cd frontend && npm run dev    # :5173
```

`vite.config.js` still proxies `/api` to `localhost:5000` in dev, and
`api.js` falls back to `/api` when `VITE_API_BASE` is unset, so local keeps
working with no extra configuration.

