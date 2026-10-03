# HOS Trip Planner

A full-stack truck trip planner that accepts a current location, pickup and dropoff locations, and current 70-hour cycle hours used, then outputs an FMCSA Hours-of-Service-compliant route, schedule, interactive map, and daily log sheets.

## URLs

Live URL: https://hos-trip-planner-amber.vercel.app/

## Screenshots

_to be added_

## Architecture

The planner uses a single canonical event timeline as the source of truth. A route from the OpenRouteService is fed through a pure-Python HOS scheduler (no Django, no I/O) which emits a `TripEvent[]` timeline that respects all FMCSA regulations. The frontend then renders that timeline as an interactive map with stops, a timeline view, a summary, and one FMCSA-style daily log sheet per calendar day in the home terminal's time zone.

```
ORS geocode + driving-hgv route  →  HOS scheduler  →  TripEvent[]  →  map / timeline / summary / ELD logs
```

### Backend Services

| Service | Purpose |
|---------|---------|
| `routing_service.py` | OpenRouteService HGV routing: distance, duration, and turn-by-turn steps for a leg. |
| `geocoding_service.py` | ORS forward and reverse geocoding; autocomplete for the form input. |
| `hos_scheduler.py` | FMCSA Hours-of-Service scheduler (pure Python); turns a raw route into a compliant event timeline. |
| `eld_service.py` | Generates one FMCSA-style daily log sheet per home-terminal calendar day from the timeline. |
| `route_position.py` | Interpolates position (lat/lng, miles, time) along a route leg by elapsed driving time. |
| `timezone_service.py` | Looks up the time zone of a lat/lng using timezonefinder. |

### API Endpoints

- **POST /api/trips/plan** — Input: current location, pickup location, dropoff location, cycle hours used, optional departure time. Output: route, stops, events timeline, daily logs, summary.
- **GET /api/geocode/autocomplete?q=** — Input: partial place name. Output: list of candidate locations.
- **GET /api/health** — Returns 200 OK (used to wake the backend on cold start).

## Setup

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
# Edit .env: add your ORS_API_KEY; for local development set DJANGO_DEBUG=true
python manage.py runserver
```

The backend runs on `http://localhost:8000`. No database or migrations are needed.

### Frontend

```bash
cd frontend
npm install
cp ../.env.example .env
# Edit .env to point VITE_API_BASE_URL to your backend (e.g., http://localhost:8000)
npm run dev
```

The frontend runs on `http://localhost:5173` and calls the backend directly at the `VITE_API_BASE_URL`, with CORS allowed by the backend for the frontend origin.

## Environment Variables

### Backend (.env)

| Variable | Meaning |
|----------|---------|
| `ORS_API_KEY` | OpenRouteService API key (get a free key at openrouteservice.org). |
| `DJANGO_SECRET_KEY` | Django secret key (set to a random string in production). |
| `DJANGO_DEBUG` | Set to `false` in production. |
| `ALLOWED_HOSTS` | Comma-separated list of allowed hostnames (e.g., `localhost,127.0.0.1,myhost.com`). |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins (e.g., `http://localhost:5173,https://myapp.vercel.app`). |

### Frontend (.env)

| Variable | Meaning |
|----------|---------|
| `VITE_API_BASE_URL` | Backend API base URL (e.g., `http://localhost:8000` for local dev, `https://api.myapp.com` for production). |

## Routing API Setup

Get a free OpenRouteService API key at [openrouteservice.org](https://openrouteservice.org). The free tier allows 2,500 requests per day.

All API calls to ORS (routing and geocoding) are made from the backend; the API key is never exposed to the browser.

## HOS Rules Implemented

- 11-hour maximum driving time per day.
- 14-hour duty window (starts at pre-trip inspection, resets after 10-hour rest).
- 30-minute break required after 8 hours of driving.
- 10-hour continuous daily rest (logged as Sleeper Berth duty).
- 70-hour/8-day cycle limit; 34-hour restart when exhausted.
- Fuel stop every 1,000 miles (forced at 950 miles); if a break is due with 600+ miles since fuel, insert a fuel stop instead of a break.
- 1-hour pickup and 1-hour dropoff (do not block driving; can occur after 11/14-hour limits are reached).
- 15-minute pre-trip and post-trip inspections.
- All event times on a 15-minute grid; drive segment end times rounded up.

## Assumptions

- **Property-carrying driver** — the planner assumes a for-hire carrier, not a private or owner-operator.
- **70-hour/8-day cycle** — the driver operates under the federal 70-hour cycle, not the 60-hour/7-day short-haul exception.
- **No adverse conditions** — no weather or traffic delays; route times are deterministic.
- **Fresh clocks at trip start** — the driver begins with an 11-hour driving limit and a fresh 14-hour duty window (unless current cycle hours used indicate otherwise). The first day's log shows Off Duty from midnight until the trip starts, because the planner does not know what the driver did before.
- **Full tank at trip start** — the truck begins with a full fuel tank.
- **10-hour daily rest is continuous** — no split sleeper berth optimization; the entire 10 hours must be off-duty (Sleeper Berth).
- **Any 30+ minute non-driving period resets the 8-hour driving clock** — pickup, dropoff, fuel, and other breaks all count.
- **Fuel stops every 1,000 miles or fewer** — the planner enforces a fuel stop every 950 miles and merges it with a break if one is due at 600+ miles.
- **Fuel duration is 30 minutes** — the spec does not provide fuel duration; 30 minutes is typical.
- **Pickup and dropoff each take 1 hour.**
- **Pre-trip and post-trip inspections each take 15 minutes.**
- **Home terminal time zone = current location's time zone** — the planner looks up the time zone of the current location and uses it for all log times and day boundaries (no zone changes mid-trip).
- **Log days start and end at midnight, home terminal time.**
- **All times are on a 15-minute grid** — the trip start rounds up. A drive that ends by arriving at a waypoint (pickup, dropoff) rounds up. A drive cut short by an hours limit or by the fuel distance rounds down, so rounding never crosses a limit.
- **Truck (HGV) routing** — the planner uses the OpenRouteService `driving-hgv` profile (respects truck restrictions).
- **Departure is home-terminal time** — the form defaults to 08:00 tomorrow and the time entered is read as wall-clock time at the current location, whatever zone the browser is in. The API also accepts a time with an explicit UTC offset, and uses the current time if none is sent.
- **Rolling 8-day history is unavailable** — the planner sees only the current cycle hours used and does not track which hours roll off. Hours are conservatively assumed to remain until the trip is complete.
- **34-hour restart is used when the cycle is exhausted** — if both the 11-hour driving limit and the 70-hour cycle limit are hit, a 34-hour off-duty restart (CYCLE_RESTART) is inserted; it resets both clocks.
- **Log sheet header fields are optional inputs** — when left at their defaults the sheet shows demo values and marks them as demo: driver "Demo Driver", carrier "Demo Carrier LLC", main office "Demo City, ST", truck "TRUCK-001", trailer "TRL-001", shipping document "DEMO-0001", no co-driver. The "Shipper & Commodity" line is left blank.
- **The 14-hour window and 70-hour cycle restrict driving only** — pickup and dropoff can occur even if either limit has been reached; they do not trigger a break or restart.
- **Departure defaults to tomorrow 08:00 and is read as wall-clock time at the home terminal** — the current location's time zone.
- **When a fuel stop and a rest are due at the same point, the fuel stop is taken first.**
- **The home-terminal time zone is known only after planning** — it is printed on each log sheet and in the map popups.

## Limitations

- **No split sleeper berth** — the 10-hour rest must be taken as one continuous block.
- **No adverse-condition exception** — no emergency driving beyond the 11-hour limit.
- **No short-haul exceptions** — the planner assumes full 11/14-hour rules apply.
- **No personal conveyance** — all movement counts as duty.
- **No yard moves** — all movement counts as duty.
- **No ELD device integration** — this is a planning tool, not a real ELD.
- **No historical 8-day duty record** — the planner does not import prior days' hours, so it cannot predict when hours will roll off during multi-day trips (conservative design).
- **Daylight-saving transition days** — daily logs are built in wall-clock minutes, so every sheet totals exactly 24 hours. On the two days a year the clock changes, the real day is 23 or 25 hours, so that day's sheet is approximate.
- **Hours do not roll off during the trip** — because rolling-8-day history is not provided, the planner assumes all current cycle hours remain for the entire trip (a conservative assumption).
- **Fuel stops placed on the route** — fuel stops are inserted at computed route positions, not at real fuel stations. In production, use a real fuel-station database and reverse-geocoding to snap stops to actual stations.

## Tests

### Backend

```bash
cd backend
.venv/bin/python manage.py test
```

The backend tests cover 26 of the 27 required test cases from the spec.

### Frontend

```bash
cd frontend
npm test
```

Test 13 (log grid geometry) is a frontend vitest test.

## Deployment

**Frontend:** Deploy to [Vercel](https://vercel.com) (recommended for Next/Vite apps). Set `VITE_API_BASE_URL` to your production backend URL.

**Backend:** Deploy to [Render](https://render.com) or [Railway](https://railway.app) or similar Python host. An always-on host is recommended; the frontend pings `/api/health` on load to wake a sleeping host, and the first plan may be slow. Set environment variables on the platform:
- `ORS_API_KEY`
- `DJANGO_SECRET_KEY` (use a strong random string)
- `DJANGO_DEBUG=false`
- `ALLOWED_HOSTS` (your production domain)
- `CORS_ALLOWED_ORIGINS` (your frontend URL)

The frontend's `VITE_API_BASE_URL` must point to your production backend URL.
