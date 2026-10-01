# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Pre-implementation. The only source of truth so far is `full-stack-dev-assessment-complete-plan.md` (the spec, referenced below as §N). Read the relevant section before implementing anything; it is detailed and deliberate about HOS edge cases. Update this file with real commands once `frontend/` and `backend/` exist.

## What this is

Truck trip planner for a full-stack assessment: React (Vite + TypeScript) frontend, Django REST backend. Input: current / pickup / dropoff locations + current 70-hour cycle used (0–70, decimals OK). Output: HGV route, FMCSA Hours-of-Service-compliant schedule, map with stops, and a filled-out FMCSA paper-style daily log sheet per calendar day.

## Planned layout (§30, §56, §68)

- `backend/` — Django. `trips/` (views, serializers, urls, tests), `services/` (`routing_service.py`, `geocoding_service.py`, `hos_scheduler.py`, `eld_service.py`, `route_position.py`), `common/` (`enums.py`, `constants.py`). No database needed.
- `frontend/` — Vite React TS, react-leaflet map, hand-written SVG for log sheets (no chart lib), plain React state (no Redux).
- Env: backend `ORS_API_KEY`, `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`; frontend `VITE_API_BASE_URL`. Ship `.env.example`.
- API: `POST /api/trips/plan`, `GET /api/geocode/autocomplete?q=`, `GET /api/health`.

## Core architecture

```
ORS geocode + driving-hgv route  →  HOS scheduler  →  TripEvent[]  →  map / timeline / summary / ELD logs
```

- **One canonical `TripEvent[]` timeline** is the source of truth. Map markers, timeline, summary totals and ELD logs are all derived from it — never computed separately.
- The HOS scheduler is framework-agnostic pure Python: no Django, no HTTP, no rendering. It is the main test target.
- All regulatory/assumption numbers live in `common/constants.py` (§31). No magic numbers in logic.
- All ORS calls (including autocomplete) go through Django so the key never reaches the browser. Do not use public Nominatim or the OSRM demo server.

## HOS rules that are easy to get wrong

- **Any contiguous ≥30 min non-driving period resets `drivingSinceBreak`** — pickup, dropoff, fuel, rest, or adjacent short events. Only insert a `BREAK` when 8h of driving accrues without one (§5.6).
- **14-hour window and 70-hour cycle restrict driving only.** Check them only before driving segments. Pickup, dropoff, fuel and inspections are never blocked; never insert a rest/restart before dropoff (§5.2, §5.13, §19). `cycleUsed` may exceed 70 from non-driving work; display `max(0, 70 - cycleUsed)`.
- 14-hour window starts at the pre-trip inspection, not first driving.
- 11h/14h exhausted → `POST_TRIP` → `DAILY_REST` 10h (**Sleeper Berth**) → `PRE_TRIP`. Cycle exhausted → same but `CYCLE_RESTART` 34h (Off Duty); restart wins if both bind. Input of 70 → trip starts with the restart.
- No rolling 8-day roll-off (history not provided) — conservative by design (§5.14–5.15).
- Fuel forced at 950 mi; if a break comes due with `milesSinceFuel >= 600`, insert `FUEL` instead of `BREAK` (§5.12).
- **15-minute grid** everywhere: round trip start up; waypoint-ending drive segments round up; fuel-distance-cut segments round down (§5.21). Every daily log's four rows must sum to exactly 24h (assert it).
- **Home terminal time zone** = current location's zone (`timezonefinder`). Timezone-aware datetimes only; days split at home-terminal midnight; zone printed on each sheet (§5.19).
- Stop positions are interpolated by **elapsed time along ORS steps**, not average speed (§25). Reverse geocode once per stop, cached, concurrently, with fallback.
- Out of scope: split sleeper, adverse conditions, short-haul exceptions, personal conveyance, yard moves (§5.17).

Event → duty status mapping: §14. Required test cases (1–27): §60. Definition of done: §75.
