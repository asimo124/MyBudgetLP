# MyBudgetLP

Vue 3 + Vite admin shell (fork of MyBudget) that talks to **recipes_laravel** instead of BillsSite PHP.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5174 — Vite proxies `/api` to `http://localhost:8080` (recipes_laravel Docker).

## Auth (Laravel Sanctum)

Same contract as `recipes_vue`:

- `POST /api/login` — `{ email, password }` → `{ token, user }`
- `GET /api/me` — Bearer token → `{ user }`
- `POST /api/logout` — Bearer token

Tokens are stored in `localStorage` (`mybudget_token`) and sent as `Authorization: Bearer <token>`.

Local default user (seeded): `alex@recipes.local` / `recipes`

## Env

- `.env` → `VITE_API_BASE_URL=http://localhost:8080`
- `.env.production` → `VITE_API_BASE_URL=https://rcpapi.hawleywebdesign.com`

## Scripts

- `npm run dev` — local development (port 5174)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build
