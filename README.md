# AI Guardian

AI Guardian is a security-first yield opportunity dashboard. Guardian continuously
monitors Web3 opportunities, ranks them with a deterministic 100-point framework,
and explains every recommendation before any assets move.

- **Phase 1** — React frontend (`frontend/`): dashboard, opportunity explorer,
  analysis detail, guardian protection view, activity feed and settings.
- **Phase 2** — Real backend (`backend/`): Node.js/Express API, PostgreSQL for
  persistent data, Redis caching, and a server-side ranking engine. The frontend
  now consumes live API data only; no fake data flows through the product.
- **Phases 3–6** — Live data pipeline, on-chain security layer, KeeperHub
  controlled execution, and a full end-to-end execution + hardening phase. The
  final phase adds the **web → web3 filter**: the backend scans the public
  chain itself for new pools (Uniswap V2/V3 `PairCreated`/`PoolCreated`),
  screens every candidate fully on-chain, and POSTS every candidate that
  qualifies as legit (token screen **and** live on-chain liquidity) as a
  rankable opportunity (`source='webfeed'`) with honest `null` APY/TVL — the
  raw on-chain reserves are kept as evidence, nothing is fabricated. The rest
  stays in an honest screening queue at `/discovery`. See
  `full end to end execution and testing/README.md`.

## Architecture

```
ai-guardian/
├── frontend/                 React 19 + Vite + Tailwind CSS
│   └── src/
│       ├── services/          api.js (centralized HTTP client), mapping.js
│       ├── hooks/             useOpportunities, useActivities, useGuardianStatus, usePreferences
│       ├── pages/             Dashboard, Opportunities, Guardian, Activity, Settings
│       └── data/mock/         Isolated mock reference (not used by the app)
└── backend/                  Node.js (ESM) + Express
    └── src/
        ├── routes/            /api/health, /api/opportunities, /api/rankings,
        │                      /api/preferences, /api/activities, /api/guardian
        ├── ranking/           100-point engine (scores, safety filters, ranker)
        ├── repositories/      PostgreSQL data access
        ├── cache/             Redis wrapper (degrades gracefully)
        ├── external/          Provider layer (local data channel today)
        └── models/            schema.sql + seed data
```

## Requirements

- Node.js >= 20 (developed on Node 24)
- PostgreSQL 16+
- Redis 7+

## Setup

### 1. Database and cache

With Homebrew:

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
```

### 2. Backend

```bash
cd backend
npm install
npm run db:setup   # creates ai_guardian DB, applies schema, seeds demo data
npm run dev        # http://localhost:3000
```

Configuration lives in `backend/.env` (dev defaults, no secrets):

```
PORT=3000
DATABASE_URL=postgres://<user>@localhost:5432/ai_guardian
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173
```

If Redis is unavailable the API still works; cache calls fail soft to
PostgreSQL.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The frontend reads `VITE_API_BASE_URL` (default `http://localhost:3000`) from
`frontend/.env`. When the backend is unreachable, pages show explicit error
states with retry — the product never silently falls back to fake data.

## API

| Method | Endpoint                    | Description                                  |
| ------ | --------------------------- | -------------------------------------------- |
| GET    | `/api/health`               | Service and dependency status                |
| GET    | `/api/opportunities`        | List opportunities (filters, sorting, paging)|
| GET    | `/api/opportunities/:id`    | Single opportunity (id or slug)              |
| GET    | `/api/opportunities/discovery` | On-chain registry cursors + web→web3 screening queue (incl. `posted` count) |
| POST   | `/api/rankings`             | Personalized ranking                         |
| GET    | `/api/preferences`          | Current user preferences                     |
| POST   | `/api/preferences`          | Update allocation / risk preference / wallet |
| GET    | `/api/activities`           | Activity feed                                |
| GET    | `/api/guardian/status`      | Protection module status                     |

`POST /api/rankings` accepts:

```json
{
  "allocation": 100,
  "riskPreference": "moderate"   // conservative | moderate | aggressive
}
```

## Ranking engine

Every opportunity is scored server-side on a 100-point framework:

| Factor        | Max | What it measures                                              |
| ------------- | --- | ------------------------------------------------------------- |
| Security      | 35  | Contract security, protocol history, liquidity stability, permissions, exploit indicators |
| Potential     | 25  | Current yield, sustainability, incentives, opportunity size, market conditions |
| Sustainability| 15  | Business model, reward sustainability, protocol activity      |
| Liquidity     | 10  | Available liquidity, withdrawal conditions                    |
| User fit      | 15  | Capital fit (vs. allocation), risk-preference fit, complexity, time commitment |

Labels: **80–100 Strong Candidate**, **65–79 Worth Considering**,
**45–64 High Caution**, **0–44 Avoid**.

Hard safety filters run **before** scoring. Critical exploit/rug-pull signals,
or suspicious permissions with weak security evidence, block an opportunity
entirely and cap it inside the Avoid band regardless of headline returns.

Ranking is deterministic: the same allocation and risk preference always
produce the same ranking. Results are cached in Redis and persisted to
PostgreSQL.

## Tests

```bash
# Backend (ranking engine, validators, API integration)
cd backend && npm test

# Frontend (mapping, hooks, components)
cd frontend && npm test
```

API integration tests run against a live local database and are skipped when
PostgreSQL is not running.

## Phase scope notes

- Phase 2 connects real data, ranking, preferences and activity through the
  backend. KeeperHub execution remains disabled by design; nothing can move on
  chain until a later phase and explicit user approval.