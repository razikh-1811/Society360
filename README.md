# Society360 – Smart Township Management Platform

MERN-stack MVP for a 2,400-home gated township in Pune: maintenance billing and mock payments, bank-statement
reconciliation, AI-assisted complaint management with deterministic emergency escalation, and committee analytics.

- **Frontend:** React, Vite, React Router, Axios, Recharts, Lucide, custom CSS (no CSS framework)
- **Backend:** Node.js, Express, Mongoose, JWT, bcryptjs, Zod, Multer
- **Database:** MongoDB

See [`deployment.md`](deployment.md) for setup, environment variables, deployment steps and demo credentials.

```bash
cd server && npm install && cp .env.example .env && npm run seed && npm run dev
cd client && npm install && npm run dev
```
