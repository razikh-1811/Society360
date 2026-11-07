# Society360 – Deployment Guide

Smart Township Management Platform · MERN stack (MongoDB Atlas · Express · React/Vite · Node.js)

> **Honest status:** this guide was written and the application was tested **locally** (backend and UI tests against a local MongoDB 7). The author's build environment could not reach MongoDB Atlas, Gemini, Vercel or Render, so **the steps in sections 4 to 6 have not been executed against those services**. Nothing in this document claims a live deployment. Verify using the checklist in section 7 after you deploy.

Repository: https://github.com/razikh-1811/Society360

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 20 or newer, and npm | Tested on Node 22 |
| Git | To clone the repository |
| MongoDB | A MongoDB Atlas cluster (free tier is enough), or a local MongoDB 6/7 for development |
| Gemini API key | Optional. Without it the app still works: complaints fall back to category "Other" and are flagged for manual review |
| Accounts | Vercel (frontend), Render (backend), MongoDB Atlas (database) |

## 2. Project layout

```
server/   Express API (config, controllers, middleware, models, routes, services, utils, seed, tests)
client/   React + Vite single-page app (plain CSS, no CSS framework)
```

## 3. Local setup

```bash
git clone https://github.com/razikh-1811/Society360.git
cd Society360

# Backend
cd server
npm install
cp .env.example .env        # then fill in the values (see section 3.1)
npm run seed                # loads demo data (clears the target database first)
npm run dev                 # API on the PORT you configured

# Frontend (second terminal)
cd client
npm install
cp .env.example .env        # optional locally: the dev server proxies /api to localhost:5000
npm run dev                 # http://localhost:5173
```

### 3.1 Environment variable names

**Backend (`server/.env`)**. Names only; never commit values.

| Name | Required | Purpose |
|---|---|---|
| `NODE_ENV` | Recommended | `production` on Render |
| `PORT` | Local only | Port for the API. Render supplies its own |
| `MONGODB_URI` | Yes | MongoDB connection string (Atlas or local) |
| `MONGODB_URI_TEST` | Tests only | A separate MongoDB used by the Jest suite |
| `JWT_SECRET` | Yes | Long random string used to sign login tokens |
| `JWT_EXPIRES_IN` | Optional | Token lifetime |
| `CLIENT_ORIGIN` | Yes | Allowed browser origin(s) for CORS: your Vercel URL. Comma-separate several |
| `GEMINI_API_KEY` | Optional | Enables AI complaint classification |
| `GEMINI_MODEL` | Optional | Gemini model name to use |
| `LATE_FEE_GRACE_DAYS` | Optional | Late-fee demo rule: grace period in days |
| `LATE_FEE_PERCENT_PER_MONTH` | Optional | Late-fee demo rule: percent per month |
| `SEED_FORCE` | Seeding in production only | Must be set to `true` to allow seeding when `NODE_ENV` is `production` |

**Frontend (`client/.env`)**

| Name | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | In production | Full API base URL including the `/api` suffix (the Render URL plus `/api`) |

Never put secrets in frontend variables: anything prefixed `VITE_` is public in the browser bundle.

## 4. MongoDB Atlas

1. Create a free cluster.
2. **Database Access:** create a database user with read/write access. Use a strong generated password.
3. **Network Access:** allow the backend to connect. Render's outbound IPs change, so the simplest option is to allow access from anywhere (`0.0.0.0/0`) and rely on the strong user password. For tighter control, use Render's documented outbound IP ranges instead.
4. **Connect:** copy the driver connection string, replace the placeholders with your user and password, and add a database name (for example `society360`). Put it in `MONGODB_URI`.
5. Seed the data from your own machine (this is the easiest and safest way):
   ```bash
   cd server
   # set MONGODB_URI to the Atlas string in your .env, then:
   SEED_FORCE=true npm run seed
   ```
   The seed script **deletes existing Society360 collections first**. Run it only against a database meant for the demo.

## 5. Backend on Render

1. New → **Web Service** → connect the GitHub repository.
2. **Root Directory:** `server`
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. **Health Check Path:** `/api/health`
6. **Environment:** add `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`, and optionally `GEMINI_API_KEY`, `GEMINI_MODEL` and the late-fee variables. Set `CLIENT_ORIGIN` after you know the Vercel URL, then redeploy.
7. Note the service URL.

Known limitations on Render's free tier:
- The service sleeps when idle, so the first request after a pause is slow.
- The disk is **ephemeral**: complaint photos uploaded to `server/uploads` are lost on redeploy or restart. For production use object storage (see "Future improvements" in the Technical Design Document).

## 6. Frontend on Vercel

1. New Project → import the same repository.
2. **Root Directory:** `client`
3. **Framework Preset:** Vite. **Build Command:** `npm run build`. **Output Directory:** `dist`
4. **Environment Variable:** `VITE_API_URL` = your Render URL followed by `/api`
5. Deploy. `client/vercel.json` already rewrites all routes to `index.html`, so deep links and page refreshes work.
6. Copy the Vercel URL into the backend's `CLIENT_ORIGIN` and redeploy the backend.

## 7. Post-deployment verification checklist

Do not consider the deployment successful until each item passes on the live URLs:

- [ ] `https://<your-render-url>/api/health` returns `{"status":"ok", ...}`
- [ ] The login page loads from Vercel and signing in works (no CORS error in the browser console)
- [ ] Resident dashboard shows the seeded bill and figures
- [ ] A demo payment succeeds and a receipt opens
- [ ] Help desk: bank reconciliation accepts the sample CSV and shows matched, review and duplicate results
- [ ] A complaint containing "gas leak" is created as Critical and escalated
- [ ] Committee dashboard loads and shows charts
- [ ] If `GEMINI_API_KEY` is set: a normal complaint shows source "AI (Gemini)". If it is not set, it shows the fallback notice

## 8. Running the tests

```bash
# Backend: Jest + Supertest. Needs a real MongoDB (use a throwaway database).
cd server
MONGODB_URI_TEST=mongodb://127.0.0.1:27017/society360_test npm test

# UI integration tests: renders the real React app against a running, seeded API.
# Start the API with CLIENT_ORIGIN=http://localhost:3000 and PORT=5055, run `npm run seed`, then:
cd client
npm run test:ui
```

The UI tests change the database (payments, complaints, reconciliation), so re-seed afterwards.

## 9. Demo login details

All demo accounts use the password **`Demo@1234`**. All data is fictional.

| Role | Email | Notes |
|---|---|---|
| Resident | `swati@society360.demo` | Flat T12-0408, ₹6,370 bill, 47 days overdue |
| Resident | `neeraj@society360.demo` | Flat T07-1203, ₹7,475 bill, fully paid |
| Resident | `aamir@society360.demo` | Flat T21-1601, ₹10,660 bill, ₹5,000 paid |
| Resident | `resident4@society360.demo` … `resident12@society360.demo` | Other demo flats |
| Help Desk Staff | `helpdesk@society360.demo` | Full complaint management and bank reconciliation |
| Help Desk (Duty Manager) | `dutymanager@society360.demo` | Receives emergency escalations |
| Help Desk Staff | `helpdesk2@society360.demo`, `helpdesk3@society360.demo` | Additional assignees |
| Committee Member | `committee@society360.demo` | Read-only. The login page also has a one-click "Committee member" demo button |

**Trying bank reconciliation:** sign in as Help Desk, open *Reconciliation*, click *Sample CSV*, then upload that file. You will see matched, manual-review, unmatched and duplicate results. Uploading it a second time proves duplicates are blocked.

Change or remove the demo accounts before using the system with real data.

## 10. Late-fee rule (configurable demonstration)

The client has not specified a late-fee policy, so the system uses a documented, configurable demonstration rule:

`late fee = balance × (percent per month ÷ 100) × (days overdue − grace days) ÷ 30`

It is zero within the grace period and zero once the balance is cleared. It is shown for information and is **not** collected by the demo payment flow. Adjust it with `LATE_FEE_GRACE_DAYS` and `LATE_FEE_PERCENT_PER_MONTH`.
