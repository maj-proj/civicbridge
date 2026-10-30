# CivicBridge — Frontend

Next.js 16 (App Router) frontend for CivicBridge.

See the [root README](../README.md) for full setup instructions, environment
variables, and architecture documentation.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in values
npx prisma migrate dev
npx prisma db seed
npm run dev                  # http://localhost:3000
```

## Tests

```bash
npm test   # 51 unit tests: priority engine, news pipeline, SOS speech builder
```

## Build

```bash
npm run build
```
