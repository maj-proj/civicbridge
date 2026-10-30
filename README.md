# CivicBridge

AI-powered civic issue monitoring, reporting, and personal emergency dispatch.
Citizens photograph a problem, pin a location, and the platform classifies it,
scores urgency, routes a formal notice to the responsible municipal authority,
and — when life is at risk — places an AI voice call to emergency services on
their behalf.

---

## Features

### Garbage & Pothole Reporting
- Upload a photo; YOLOv8 on FastAPI classifies waste type and detects potholes.
- Google Places autocomplete + interactive Google Maps pin picker for precise
  location selection.
- Custom SVG map markers: green bin icon for garbage, amber crater icon for potholes.
- Priority engine scores severity 0–100 (Low / Medium / High / Very High), factoring
  in waste composition, zone sensitivity (hospital, school, lake), and recurrence.
- Groq drafts a formal authority notice; Resend delivers it to the ward office.

### Emergency SOS — AI Voice Dispatch
- Persistent **Emergency SOS** button at the bottom of the sidebar, visually
  distinct from navigation links.
- One click opens a modal with **five personal emergency situations**:
  - 🫀 Medical Emergency → Ambulance / 108
  - 🛡 Physical Assault or Threat → Police / 100
  - 🔫 Theft & Armed Robbery → Police Crime Unit / 100
  - 🚗 Severe Road Accident → Trauma & Traffic / 108
  - 🔥 Fire & Trapped Indoors → Fire & Rescue / 101
- GPS location is fetched automatically; a Nominatim reverse-geocode resolves a
  street address.
- Citizen identity is read from the Clerk session (or the anonymous username);
  the user can switch to anonymous before calling.
- Selecting a situation starts a 5-second cancellable countdown, then `POST /api/sos/call`
  triggers a Twilio outbound call to the target emergency number.
- Twilio reads a fully contextual AI-generated speech announcement: who called,
  where they are, and what the emergency is.
- **Dry-run mode** — leaving `TWILIO_*` variables empty skips the real call and
  returns a simulated response; the rest of the flow is unchanged.

### Civic News Feed
- Aggregates local civic news via GNews API (falls back to Google News RSS).
- 15-minute cache; deduplicates syndicated stories.

---

## Architecture

```
 photo + location
        │
        ▼
 ┌──────────────────┐   multipart   ┌───────────────────────────┐
 │  Next.js 16      │──────────────▶│  FastAPI + YOLOv8         │
 │  App Router      │               │  POST /predict/garbage    │
 │  /api/reports/*  │◀──────────────│  POST /predict/pothole    │
 └────────┬─────────┘   JSON        └───────────────────────────┘
          ├── Google Places ───────▶ autocomplete + map pin
          ├── reverse geocode ─────▶ address + ward (Nominatim)
          ├── sensitive zones ─────▶ hospital / school / lake multiplier
          ├── recurrence ──────────▶ prior reports within 50 m / 30 days
          │
          ▼
   computePriority()  ──▶  score 0–100  ──▶  Low | Medium | High | Very High
          │
          ▼  (background, after response is sent)
   resolveAuthority()  ──▶  ward office or pollution control
          │
          ▼
   composeAuthorityEmail()  ──▶  Groq writes prose into a fixed template
          │
          ▼
   sendAuthorityEmail()  ──▶  dry_run | sandbox | live  ──▶  EmailLog row

 Emergency SOS path
 ──────────────────
 SOS button (sidebar)
        │  open dialog
        ▼
 SosModal  ──  GPS + identity resolved client-side
        │  option selected → 5 s countdown
        ▼
 POST /api/sos/call
        │
        ▼
 Twilio calls.create()  ──▶  target emergency number
        │  TwiML (inline)
        ▼
 AI speech: name + location + emergency type
```

The Python service is **pure vision**: no database, no secrets, no opinion on
priority. Scoring and routing live in Next.js so the algorithm can be tuned
without redeploying the model container.

---

## Running it

Two processes. Start the vision service first.

### 1. Vision service

```bash
cd backend
python -m venv venv
venv/Scripts/activate          # Windows;  source venv/bin/activate on Unix
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Check it: <http://localhost:8000/health>

| Endpoint | Purpose |
|---|---|
| `POST /predict/garbage` | Garbage detection (alias: `POST /predict`) |
| `POST /predict/pothole` | Pothole detection (alias: `POST /detect/pothole`) |
| `GET /classes` | The garbage model's class names and their waste categories |
| `GET /health` | Liveness check, per model |

Both return an `annotated_image_url` served from `/static`; the pothole route
can also inline the overlay as base64 with `?include_base64=true`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local      # then fill in the values below
npx prisma migrate dev          # creates the tables
npx prisma db seed              # authorities + sensitive zones
npm run dev
```

Open <http://localhost:3000/dashboard>.

### Tests

```bash
cd frontend
npm test        # 51 tests: priority engine, news pipeline, SOS speech builder
```

---

## Environment variables

Only `DATABASE_URL` is strictly required. Everything else degrades gracefully.

### Core

| Variable | Required | Default / Without it |
|---|---|---|
| `DATABASE_URL` | **yes** | Reports are analysed but not saved |
| `GARBAGE_API_URL` | no | `http://localhost:8000` |
| `GARBAGE_API_TIMEOUT_MS` | no | `30000` |

### Authentication (Clerk)

Anonymous sign-in works without these. Clerk adds named identity to SOS calls.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | From Clerk dashboard |
| `CLERK_SECRET_KEY` | From Clerk dashboard |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |

### Image storage (Cloudinary)

Without these, images fall back to `public/uploads` (dev only — lost on next build).

| Variable | Notes |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | |
| `CLOUDINARY_API_KEY` | |
| `CLOUDINARY_API_SECRET` | |
| `CLOUDINARY_UPLOAD_FOLDER` | Defaults to `civicbridge/garbage` |

### Notice drafting (Groq)

Without `GROQ_API_KEY`, the deterministic template is used instead of AI prose.

| Variable | Notes |
|---|---|
| `GROQ_API_KEY` | `gsk_…` |
| `GROQ_MODEL` | Defaults to `llama-3.3-70b-versatile` |

### Email delivery

`EMAIL_MODE` controls delivery. **Default is `dry_run`.**

| Variable | Notes |
|---|---|
| `EMAIL_MODE` | `dry_run` \| `sandbox` \| `live` |
| `EMAIL_OVERRIDE_TO` | Required for `sandbox` mode |
| `EMAIL_ALLOW_LIVE` | Must be `true` to enable `live` |
| `EMAIL_FROM` | Sender address |
| `RESEND_API_KEY` | `re_…` — only `dry_run` works without it |

- **`dry_run`** — compose and log only; nothing leaves the machine.
- **`sandbox`** — deliver everything to `EMAIL_OVERRIDE_TO`; real recipient preserved
  in the subject line and `EmailLog.intendedTo`.
- **`live`** — deliver to the real authority. Also requires `EMAIL_ALLOW_LIVE=true`.

> The two gates on `live` are deliberate. This system mails municipal officials an
> AI-drafted complaint carrying a machine-assigned severity. Switching that on should
> be a decision, not an accident, and requires a verified sending domain.

### Google Maps & Places

Enable **Maps JavaScript API** and **Places API** on Google Cloud Console.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Used client-side for autocomplete + map |

### Emergency SOS (Twilio)

Leaving these empty activates **dry-run mode** — the full flow runs but no real
call is placed. Set them to enable live AI voice dispatch.

| Variable | Notes |
|---|---|
| `TWILIO_ACCOUNT_SID` | From Twilio Console |
| `TWILIO_AUTH_TOKEN` | From Twilio Console |
| `TWILIO_PHONE_NUMBER` | Your Twilio caller ID (e.g. `+12015551234`) |
| `SOS_EMERGENCY_OVERRIDE_PHONE` | Dev override — routes all SOS calls to this number instead of the real emergency line |

### Civic news feed

| Variable | Notes |
|---|---|
| `GNEWS_API_KEY` | Optional. Without it falls back to Google News RSS |
| `GNEWS_MAX_ARTICLES` | Max 10 on free tier |
| `NEWS_LANGUAGE` | `en` |
| `NEWS_COUNTRY` | `in` |

---

## The priority algorithm

`frontend/src/lib/priority/computePriority.ts` is pure — no database, no fetch,
no clock. Everything it needs arrives as arguments, which is what makes it
testable and what lets the thresholds be pinned.

```
volume   = saturating curve on object count, blended with area when available
hazard   = composition-weighted severity, rescaled against the mildest category
mix      = how many distinct waste categories are present

base     = 0.50·volume + 0.35·hazard + 0.15·mix
adjusted = base · confidenceFactor
score    = adjusted + zoneBoost + recurrenceBonus
```

Three things worth knowing:

**Zone sensitivity escalates into the remaining headroom**, rather than
multiplying the base. A plain multiplier saturates — any base above ~63 times
1.6 pins at 100, so a moderate pile near a market would tie with a hazardous
dump outside a hospital. Escalating a share of what is left preserves the ordering.

**Hazard is rescaled against the mildest category**, not against zero. Without
that, pure paper litter still scores 30/100 on severity and every report
inherits a large constant floor.

**Biomedical waste forces a minimum of 55 (High)** regardless of volume. One
syringe scores near zero on volume and is still a public-health problem — but
the current model cannot detect it (see below).

### What the trained model actually detects

`best.pt` has **10 classes**, mapping to 5 of the 8 categories:

| Category | Classes | Weight |
|---|---|---|
| E-waste | battery | 0.80 |
| Glass | glass bottle | 0.60 |
| Metal | can, pop tab | 0.60 |
| Plastic | plastic bag, plastic bottle, plastic bottle cap | 0.50 |
| Paper/Cardboard | cardboard, drink carton, paper | 0.30 |

**`Biomedical/Hazardous` and `Organic/Food` classes do not exist** in this model.
The biomedical floor is unreachable today; it stays in the code for when the model
is retrained. Severity effectively ranges from paper (0) to battery (71/100).

Representative scenario scores:

| Score | Band | Scenario |
|---|---|---|
| 7.7 | Low | 2 paper scraps in an open field |
| 27.0 | Low | 5 plastic bottles on a roadside |
| 43.3 | Medium | 12 mixed plastic and paper items |
| 55.0 | High | a single syringe (biomedical floor) |
| 57.7 | High | 20 objects across 3 categories |
| 77.1 | High | same 20 objects, next to a school |
| 79.4 | High | 120-object mixed dump |
| 95.3 | Very High | 60 objects of hazardous waste beside a hospital |

Weights live in `weights.ts`; recalibrate there and the tests will tell you if
a band boundary moved.

---

## Known gaps

- **Category weights are provisional.** Run `GET /classes` against your real
  `best.pt` and reconcile — unrecognised categories fall back to 0.45.
- **Thresholds need calibration against real photographs.** The table above is
  from synthetic fixtures, not field images.
- **Ward matching is point-and-radius**, not real ward polygons.
- **Rate limiting is in-process**, so it does not hold across instances.
- **`public/uploads` is a development fallback.** Configure Cloudinary before
  deploying — anything written beside the build is lost on the next deploy.
- **Twilio SOS is in dry-run by default.** Fill in `TWILIO_*` env vars and set
  `SOS_EMERGENCY_OVERRIDE_PHONE` to your verified number to test live calling.
- **SOS calls real emergency lines in production.** Always verify the target
  numbers and test with `SOS_EMERGENCY_OVERRIDE_PHONE` first.
