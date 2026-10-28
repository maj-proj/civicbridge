# CivicBridge

AI-powered civic issue monitoring and reporting. Citizens submit a photograph
and a location; the platform classifies the waste, scores how urgent it is,
and routes a formal notice to the responsible municipal authority.

This repository currently implements the **garbage reporting** track. Pothole
detection follows the same pipeline and is not built yet.

---

## How a report flows

```
 photo + coordinates
        │
        ▼
 ┌──────────────────┐   multipart   ┌───────────────────────────┐
 │  Next.js         │──────────────▶│  FastAPI + YOLOv8         │
 │  /api/reports/   │               │  POST /predict            │
 │     garbage      │◀──────────────│  object counts, classes,  │
 └────────┬─────────┘   JSON        │  category distribution    │
          │                         └───────────────────────────┘
          ├── reverse geocode ─────▶ address + ward
          ├── sensitive zones ─────▶ hospital / school / lake multiplier
          ├── recurrence ──────────▶ prior reports within 50m / 30 days
          │
          ▼
   computePriority()  ──▶  score 0–100  ──▶  Low | Medium | High | Very High
          │
          ▼  (after the response is sent)
   resolveAuthority()  ──▶  ward office, or pollution control for hazardous waste
          │
          ▼
   composeAuthorityEmail()  ──▶  Groq writes prose into a fixed template
          │
          ▼
   sendAuthorityEmail()  ──▶  dry_run | sandbox | live  ──▶  EmailLog row
```

The Python service is **pure vision**: no database, no secrets, no opinion on
priority. Scoring and routing live in the Next.js app so tuning the algorithm
never means redeploying the model container.

---

## Running it

Two processes. Start the vision service first.

### 1. Vision service

```bash
cd "Garbage YOLOv8/backend"
python -m venv venv
venv/Scripts/activate          # Windows;  source venv/bin/activate on Unix
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Check it: <http://localhost:8000/health>

`GET /classes` lists the model's real class names and the waste category each
one maps to — use it to verify the weights in
`frontend/src/lib/priority/weights.ts` match the model you actually trained.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local      # then fill in the values below
npx prisma migrate dev          # creates the tables
npx prisma db seed              # authorities + sensitive zones
npm run dev
```

Open <http://localhost:3000/dashboard/garbage-reporting>.

### Tests

```bash
cd frontend
npm test        # priority engine, including the band thresholds
```

---

## Environment

Only `DATABASE_URL` is strictly required. Everything else degrades:

| Variable | Required | Without it |
|---|---|---|
| `DATABASE_URL` | yes | Reports are analysed but not saved |
| `GARBAGE_API_URL` | defaults to `localhost:8000` | Reports save unscored, flagged for re-analysis |
| `CLOUDINARY_*` | no | Images are written to `public/uploads` (dev only) |
| `GROQ_API_KEY` | no | Emails use the deterministic template instead of AI prose |
| `RESEND_API_KEY` | no | Only `dry_run` email mode works |
| `EMAIL_OVERRIDE_TO` | for sandbox | Sandbox mode refuses to send |

### Email modes

`EMAIL_MODE` controls delivery. **The default is `dry_run`.**

- **`dry_run`** — the authority is resolved and the message composed and
  logged, but nothing leaves the machine.
- **`sandbox`** — everything is delivered to `EMAIL_OVERRIDE_TO`. The genuine
  recipient is preserved in the subject line, in an injected banner at the top
  of the body, and in `EmailLog.intendedTo`.
- **`live`** — delivered to the real authority. Additionally requires
  `EMAIL_ALLOW_LIVE=true`.

Demo on `sandbox`. The routing logic runs for real — it resolves the actual
ward office from the coordinates — and the mail arrives in your own inbox. The
seeded `Authority` rows hold genuine municipal addresses rather than a personal
one on purpose: substituting your own address there would mean the routing code
is never exercised.

> The two gates on `live` are deliberate. This system mails municipal officials
> an AI-drafted complaint carrying a machine-assigned severity. Switching that
> on should be a decision, not an accident, and it needs a verified sending
> domain first.

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
dump outside a hospital. Escalating a share of what is left preserves the
ordering.

**Hazard is rescaled against the mildest category**, not against zero. Without
that, pure paper litter still scores 30/100 on severity and every report
inherits a large constant floor.

**Biomedical waste forces a minimum of 55 (High)** regardless of volume. One
syringe scores near zero on volume and is still a public-health problem — but
see the note below: the current model cannot detect it.

### What the trained model actually detects

`best.pt` has **10 classes**, which map to 6 of the 8 categories:

| Category | Classes | Weight |
|---|---|---|
| E-waste | battery | 0.80 |
| Glass | glass bottle | 0.60 |
| Metal | can, pop tab | 0.60 |
| Plastic | plastic bag, plastic bottle, plastic bottle cap | 0.50 |
| Paper/Cardboard | cardboard, drink carton, paper | 0.30 |

**There is no `Biomedical/Hazardous` and no `Organic/Food` class.** Two
consequences:

- The critical-category floor is unreachable with this model. The code stays
  in place for when the model is retrained, but today it never fires.
- Severity effectively ranges from paper (0) to battery (71/100). Escalation
  for genuinely dangerous waste rests almost entirely on zone sensitivity.

If hazardous-waste detection matters, the model needs retraining with those
classes — no amount of scoring logic can recover a signal the vision model
cannot see.

Current spread across representative scenarios:

| Score | Band | Scenario |
|---|---|---|
| 7.7 | Low | 2 paper scraps in an open field |
| 27.0 | Low | 5 plastic bottles on a roadside |
| 43.3 | Medium | 12 mixed plastic and paper items |
| 55.0 | High | a single syringe |
| 57.7 | High | 20 objects across 3 categories |
| 77.1 | High | the same 20 objects, next to a school |
| 79.4 | High | 120-object mixed dump |
| 95.3 | Very High | 60 objects of hazardous waste beside a hospital |

Weights live in `weights.ts`; recalibrate there and the tests will tell you if
a band boundary moved.

---

## Known gaps

- **Category weights are provisional.** They assume a category list
  (`Plastic`, `Paper/Cardboard`, `Glass`, `Metal`, `Organic/Food`,
  `Biomedical/Hazardous`, `E-waste`, `Other`). Run `GET /classes` against your
  real `best.pt` and reconcile. Unrecognised categories fall back to 0.45.
- **Thresholds need calibration against real photographs.** The table above is
  from synthetic fixtures, not field images.
- **Ward matching is point-and-radius**, not real ward polygons.
- **Rate limiting is in-process**, so it does not hold across instances.
- **`public/uploads` is a development fallback.** Configure Cloudinary before
  deploying — anything written beside the build is lost on the next one.
- **Pothole detection is not implemented.**
