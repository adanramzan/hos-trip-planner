# HOS Trip Planner — tasks and requirements

Checklist form of `full-stack-dev-assessment-complete-plan.md` (the spec; `§N` points at its sections). Tick boxes as work lands. The spec stays the source of truth: read the cited section before building a task.

- **Part A** — every requirement, grouped by area.
- **Part B** — build tasks in the spec's §71 phase order. Each lists its files, spec sections, and the §60 tests it must make pass.
- **Part C** — the 27 required tests and which tasks own them.
- **Part D** — the spec's §75 definition of done, verbatim, for final sign-off.

## Status (2026-10-02)

- [x] Vite + React + TypeScript frontend and Django backend scaffolded (§71 Phase 1, partly)
- [x] Frontend UI ported from the design: form, loading/empty/error states, results, map, timeline, log sheets, print view
- [ ] Frontend runs on real data — today it is three mock trips in `frontend/src/services/mockData.ts`
- [ ] Backend logic — `backend/` is a bare scaffold: no settings/env/CORS config, no services, no endpoints, no tests

Frontend status tags in Part A: **UI done, wire to API** = built but fed by mock data; **partial** / **missing** = real gap, with the file and line.

## Open questions in the spec

Decide these before or during the task named; each is a place the spec is silent or contradicts itself.

- [ ] **Rounding order (§5.21, T7/T9):** which rule wins when a segment both ends at a waypoint (round up) and is cut by a limit, and what if rounding up crosses an 11h/14h/8h limit? Proposed: apply HOS checks to rounded values; round limit-cut segments down.
- [ ] **Limit reached exactly at pickup (§20, §22, T12):** pickup first, then the next driving check inserts the rest. Implied by §20, not stated.
- [ ] **Zero-length first leg (Test 25, T4):** when current = pickup, skip the ORS call for that leg rather than send identical coordinates.
- [ ] **DST days (§5.19, T18):** 23/25-hour days break the "= 24" assertion. Spec allows either a documented limitation or wall-clock boundaries; pick one.
- [ ] **`days` in the response (§28, T20):** example shows `days: 3` for 63.5 elapsed hours; define as calendar days touched in the home zone (matches the number of log sheets).
- [ ] **Naive timestamps in §11/§72 examples** contradict §5.19. Use timezone-aware ISO strings everywhere.
- [ ] **Fuel-stop counts (Tests 7, 8):** exact counts depend on placement; assert "at least" and "never more than 1,000 mi between fuel stops".


## Part A — Requirements

### Project goal & architecture (§1, §73–§74, §78)
- [ ] App produces: route current → pickup → dropoff, HOS-compliant schedule, required fuel/break/rest/restart stops, map with stops, and a daily log sheet per calendar day (§1)
- [ ] Deliverables: live hosted version, GitHub source, 3–5 minute Loom walkthrough (§1)
- [ ] Flow is RouteService → HOSPlanner → `TripEvent[]` → map / ELD / timeline; no single `calculate_everything()` function (§73)
- [ ] Example flow works end to end: Boston, MA → Chicago, IL → Los Angeles, CA at cycle 15 shows overview, map, timeline, and Day 1…N logs (§74)
- [ ] The core is a deterministic HOS timeline generator; map, timeline, summary and logs are only views of it (§78)

### Inputs & validation — rules (§2–§3)
- [ ] Form has four required inputs: current location, pickup location, dropoff location, current cycle used (hours) (§2)
- [ ] Each of the three locations is required, resolves to valid coordinates, and is routable (§2)
- [ ] An unresolvable location returns a friendly error, not a crash (§2) — Test 16
- [ ] Empty locations are rejected (§2) — Test 16
- [ ] Cycle used must be numeric, min 0, max 70, decimals allowed (e.g. 18.5, 69.75, 70) (§2)
- [ ] Cycle used rejects -1, 71, abc and empty (§2) — Test 15
- [ ] Optional trip start date/time defaults to the current date/time (§3.1)
- [ ] Frontend sends the start timestamp with a UTC offset (e.g. 2026-10-01T08:00:00-04:00), never a naive string (§3.1)
- [ ] Backend converts the start timestamp into the home terminal time zone before scheduling (§3.1, §5.19)
- [ ] Optional collapsed "Log details" fields: driver, co-driver, carrier, main office address, truck/tractor no., trailer no., shipping doc no.; all optional, prefilled with marked demo values (§3.2)

### Assumptions (§4)
- [ ] Fixed scope: property-carrying driver, 70h/8-day cycle, no adverse driving conditions (§4)
- [ ] Fueling at least once every 1,000 miles; pickup 1h; dropoff 1h (§4)
- [ ] Driver starts with fresh 11h and 14h clocks (at least 10 consecutive hours off before start) (§4, §5.20)
- [ ] Truck starts with a full tank (milesSinceFuel = 0) (§4, §5.20)
- [ ] Fuel stop = 30 min; pre-trip and post-trip inspection = 15 min each; 10h daily rest logged as Sleeper Berth (§4)
- [ ] Travel times come from the HGV (truck) routing profile (§4, §8)
- [ ] All event boundaries fall on a 15-minute grid (§4, §5.21)
- [ ] Trip starts "now" is documented if start date/time fields are not exposed (§3.1)
- [ ] README documents each implementation assumption and the split-sleeper limitation (§4, §5.5)

### HOS rules (§5.1–§5.21)
- [ ] Driving is capped at 11h (dailyDrivingUsed, starts at 0) (§5.1) — Test 3
- [ ] Reaching 11h driving, when more driving is needed, triggers 10h off duty then resets the daily driving allowance (§5.1) — Test 3
- [ ] The 14h window starts at the first work event (pre-trip inspection), not at first driving (§5.2, §5.18) — Test 4
- [ ] dutyWindowStart tracked; dutyWindowUsed = currentTime - dutyWindowStart; max 14h (§5.2)
- [ ] 11h driving and 14h window are tracked as independent counters (§5.3)
- [ ] 10 consecutive hours off duty (Off Duty and/or Sleeper Berth) grants fresh 11h and 14h clocks (§5.4)
- [ ] After a 10h rest: dailyDrivingUsed = 0, drivingSinceBreak = 0, dutyWindowStart = null; the next pre-trip inspection starts a new window (§5.4, §22)
- [ ] 10h daily rest is simple continuous rest logged as SLEEPER_BERTH (§5.4, §5.5) — Test 24
- [ ] No split-sleeper (7+3, 7+2) logic (§5.5, §5.17)
- [ ] 30 consecutive minutes without driving required after 8 cumulative hours of driving (§5.6) — Test 2
- [ ] The break may be Off Duty, Sleeper Berth, or On Duty Not Driving (§5.6)
- [ ] Any contiguous non-driving period of at least 30 min resets drivingSinceBreak (pickup, dropoff, fuel, rest, restart) (§5.6) — Test 18
- [ ] Adjacent short non-driving events combine when contiguous (e.g. 15 min inspection + 15 min off duty); non-consecutive short periods do not combine (§5.6)
- [ ] On a non-driving event: contiguousNonDrivingMinutes += duration; if >= 30, drivingSinceBreak = 0 (§5.6)
- [ ] On a driving event: contiguousNonDrivingMinutes = 0 and drivingSinceBreak += duration (§5.6)
- [ ] A dedicated BREAK is inserted only when drivingSinceBreak would exceed 8h with no qualifying non-driving period since (§5.6, §23) — Test 2, Test 18
- [ ] The 30-min break resets only drivingSinceBreak; it does not reset dailyDrivingUsed, dutyWindowStart or cycleUsed (§5.7)
- [ ] Pickup is 60 min, ON_DUTY_NOT_DRIVING (§5.8) — Test 5
- [ ] Pickup counts toward the 14h window and 70h cycle, not toward the 11h limit or drivingSinceBreak (§5.8)
- [ ] Pickup (60 contiguous non-driving min) sets drivingSinceBreak = 0 (§5.8, §20) — Test 18
- [ ] Pickup is never blocked by an expired 14h window or exhausted 70h cycle (§5.8, §20)
- [ ] Dropoff is 60 min, ON_DUTY_NOT_DRIVING, same rules as pickup (§5.9) — Test 6
- [ ] Dropoff counts toward 14h window and 70h cycle, not driving time (§5.9)
- [ ] Dropoff is never blocked by an expired 14h window or exhausted cycle (§5.9, §21) — Test 19, Test 20
- [ ] Dropoff flow is: 1h dropoff, 15 min post-trip inspection, trip ends, remainder of the day Off Duty (§5.9, §21)
- [ ] Fuel is forced when milesSinceFuel reaches FUEL_TRIGGER_MILES = 950 (limit is 1,000) (§5.10, §24) — Test 7, Test 8
- [ ] Fuel stop = 30 min, ON_DUTY_NOT_DRIVING, counts toward 14h window and 70h cycle (§5.11)
- [ ] A fuel stop (30 contiguous non-driving min) satisfies the break via the general rule, with no special lookahead (§5.12)
- [ ] When the 8h break comes due and milesSinceFuel >= 600 (FUEL_MERGE_THRESHOLD_MILES), insert FUEL instead of BREAK; otherwise insert BREAK (§5.12, §23, §24) — Test 14, Test 27
- [ ] Fuel stops are still forced by distance at 950 mi; whichever stop comes first resets drivingSinceBreak (§5.12)
- [ ] 70h cycle counts driving, pickup, dropoff, fuel, inspections and other on-duty work; not Off Duty or Sleeper Berth (§5.13)
- [ ] cycleUsed is initialized from the input; cycleRemaining = 70 - cycleUsed (§5.13, §5.15)
- [ ] The 70h cycle is checked only before driving segments; pickup, dropoff and inspections still happen at cycleRemaining 0 (§5.13) — Test 20
- [ ] cycleUsed may exceed 70 from non-driving work; display max(0, 70 - cycleUsed) (§5.13)
- [ ] No rolling 8-day roll-off: hours never assumed to drop off during the trip (conservative by design); document it (§5.14, §5.15)
- [ ] Cycle exhausted and driving still needed: post-trip inspection, 34h restart, pre-trip inspection, resume driving (§5.15) — Test 9
- [ ] If the cycle runs out exactly on arrival at dropoff, no restart is inserted (§5.15) — Test 20
- [ ] Cycle input of 70: the trip begins with the 34h restart, then the pre-trip inspection (restart precedes the first pre-trip) (§5.15) — Test 10
- [ ] After a restart: cycleUsed = 0, cycleRemaining = 70 (§5.15)
- [ ] CYCLE_RESTART is OFF_DUTY, 34h; afterwards cycleUsed, dailyDrivingUsed, drivingSinceBreak = 0 and dutyWindowStart = null (§5.16)
- [ ] When 11h/14h and 70h bind together, the 34h restart wins (it also covers the 10h rest) (§5.16, §17, §22)
- [ ] Out of scope: adverse conditions, short-haul exceptions (CDL, non-CDL, 16h), personal conveyance, yard moves, split sleeper (§5.17)
- [ ] PRE_TRIP_INSPECTION: 15 min, on duty, at the start of every duty period (trip start, after each 10h rest, after each 34h restart) (§5.18) — Test 23
- [ ] POST_TRIP_INSPECTION: 15 min, on duty, at the end of every duty period (before each rest/restart and after dropoff) (§5.18) — Test 23
- [ ] Inspections count toward the 70h cycle; pre-trip starts the 14h window; post-trip is allowed after the 14th hour (§5.18) — Test 23
- [ ] Inspection durations live in constants so they can be changed or disabled in one place (§5.18)
- [ ] Home terminal time zone = time zone of the current location, resolved via timezonefinder (§5.19) — Test 21
- [ ] All scheduler datetimes are timezone-aware, never naive (§5.19)
- [ ] Days split at midnight in the home terminal zone, and the zone is printed on every log sheet header (§5.19) — Test 21
- [ ] DST transition days (23h/25h) must not crash the 24h assertion; handle or list as a known limitation (§5.19)
- [ ] Starting state: dailyDrivingUsed 0, drivingSinceBreak 0, dutyWindowStart null, milesSinceFuel 0, cycleUsed = input (§5.20)
- [ ] Day 1 log shows 00:00 to trip start as Off Duty (§5.20)
- [ ] Trip start time is rounded up to the next 15-minute mark (§5.21) — Test 22
- [ ] A driving segment ending at a waypoint rounds its duration up to the next 15 min (§5.21) — Test 22
- [ ] A driving segment cut by the fuel distance trigger rounds its duration down to 15 min (so 1,000 mi is never exceeded) (§5.21) — Test 22
- [ ] HOS checks use the rounded values; position interpolation may use unrounded times (§5.21)
- [ ] Every event start/end is a multiple of 15 min and every row total a multiple of 0.25h (§5.21) — Test 22
- [ ] The four duty rows sum to exactly 24h per day, asserted (§5.21) — Test 12, Test 22

### Scheduler (§15–§24)
- [ ] Scheduler state holds currentTime, homeTimezone, currentPosition, currentLegIndex, elapsedDrivingOnLeg, remainingLegDistance, remainingLegDuration (§15)
- [ ] Scheduler state holds dailyDrivingUsed, drivingSinceBreak, contiguousNonDrivingMinutes, dutyWindowStart, cycleUsed, milesSinceFuel, cumulativeMiles, totalDrivingMinutes, events[] (§15)
- [ ] The current date is derived from currentTime and not tracked separately (§15)
- [ ] Scheduler is framework-agnostic pure Python (no Django, HTTP or rendering) (§9, CLAUDE.md)
- [ ] Before each driving segment, allowedDriveMinutes = min(remainingLegDuration, 11h - dailyDrivingUsed, dutyWindowStart + 14h - currentTime, 8h - drivingSinceBreak, 70h - cycleUsed, time to travel 950 - milesSinceFuel) (§16, §17)
- [ ] Quarter-hour rounding is applied to allowedDriveMinutes (§17, §5.21)
- [ ] When allowedDriveMinutes <= 0, the binding constraint is resolved and recomputed (waypoint, break/fuel, fuel, 11h/14h, 70h) (§17)
- [ ] Flow is: init, current to pickup, pickup, pickup to dropoff, dropoff, finish; each travel leg uses the HOS engine (§18)
- [ ] Driving-only checks, in order: cycle (34h restart path), 14h window (10h rest path), 11h (10h rest path), 8h break (BREAK or merged FUEL), fuel, remaining route (§19)
- [ ] 14h and 70h checks run only before driving segments, never before pickup, dropoff, fuel or inspections (§5.2, §19)
- [ ] Pickup event: 60 min, ON_DUTY_NOT_DRIVING, cycleUsed += 1h, contiguousNonDrivingMinutes += 60, drivingSinceBreak = 0, 14h window keeps running (§20) — Test 5
- [ ] Dropoff event: 60 min on duty, followed by 15 min POST_TRIP_INSPECTION, cycleUsed += 1.25h; trip ends after post-trip (§21) — Test 6
- [ ] Never insert a DAILY_REST or CYCLE_RESTART before dropoff when only non-driving work remains (§22, §21) — Test 19, Test 20
- [ ] Daily rest is inserted only when more driving is needed and 11h is reached or the 14h window blocks driving (§22) — Test 3, Test 4
- [ ] Rest sequence: POST_TRIP_INSPECTION (15 min), DAILY_REST (10h, SLEEPER_BERTH), PRE_TRIP_INSPECTION (15 min, starts new window) (§22) — Test 23, Test 24
- [ ] If the cycle is also exhausted, CYCLE_RESTART is used instead of DAILY_REST (§22)
- [ ] After work resumes, dutyWindowStart = start of the PRE_TRIP_INSPECTION (§22)
- [ ] BREAK: 30 min, OFF_DUTY, only when drivingSinceBreak would exceed 8h and no qualifying 30 min non-driving period occurred (§23) — Test 2
- [ ] No extra BREAK after pickup, dropoff, fuel or rest (they already reset drivingSinceBreak) (§23) — Test 18
- [ ] FUEL: 30 min, ON_DUTY_NOT_DRIVING; afterwards milesSinceFuel = 0, drivingSinceBreak = 0, cycleUsed += 0.5 (§24) — Test 7, Test 8
- [ ] When fuel and break fall at the same point, exactly one 30-min FUEL stop, not BREAK plus FUEL (§5.12, §24) — Test 14, Test 27
- [ ] Short trip (5h driving, cycle 0): no break, no rest, no fuel (§17, §19) — Test 1
- [ ] Current location equals pickup: no routing error; PRE_TRIP, PICKUP, then driving to dropoff (§6, §18) — Test 25
- [ ] Every duty period starts with PRE_TRIP_INSPECTION and ends with POST_TRIP_INSPECTION (§5.18, §22) — Test 23

### Routing & position (§6–§8, §25–§26)
- [ ] Route is always current, then pickup, then dropoff; never current to dropoff alone (§6)
- [ ] Single provider: OpenRouteService for geocode, autocomplete, reverse geocode and /v2/directions/driving-hgv (§7)
- [ ] Do not use public Nominatim for autocomplete or the OSRM demo server (§7)
- [ ] All provider calls (including autocomplete) go through Django; API key never reaches the browser; expose GET /api/geocode/autocomplete?q= (§7)
- [ ] Routing returns geometry plus per-leg and per-step distance/duration (§7)
- [ ] Verify ORS free-tier quotas and max route distance accept the longest demo trip (e.g. NY to Chicago to LA); else route each leg separately and concatenate (§7)
- [ ] Use ORS HGV duration per leg and per step, not distance / single average speed (§8)
- [ ] If the provider has no truck profile, apply a documented truck-speed factor (e.g. car duration x 1.15) and state it in the README (§8)
- [ ] Routing API timeout, 503 or invalid response returns a controlled application error (§7, §8) — Test 17
- [ ] Stop position is found by elapsed driving time, not average speed (§25) — Test 26
- [ ] Interpolation walks ORS steps accumulating duration until the target time falls in a step (§25) — Test 26
- [ ] Within the step, interpolate linearly by time fraction to a distance, then walk the polyline slice (way_points [startIdx, endIdx], haversine) to a lat/lon (§25) — Test 26
- [ ] Synthetic route (step A 100 mi in 1.5h, step B 20 mi in 1h), stop at 2h elapsed: lands inside step B about 10 mi in (§25) — Test 26
- [ ] Cumulative miles stored at every stop (for daily miles and milesSinceFuel) (§25)
- [ ] Reverse geocode each stop once, cache by rounded coordinates, run concurrently in a thread pool (§25)
- [ ] A failed reverse geocode falls back to the nearest known place or coordinates, not a failed request (§25)
- [ ] Stop location feeds map marker, timeline text and ELD remarks (§25)
- [ ] Fuel stop placed at a route point around 900-950 mi, reverse geocoded; POI search must not block (§26)

### Domain model & constants (§9–§14, §31)
- [ ] One canonical TripEvent[] timeline is the source of truth; map, timeline, summary and ELD are derived from it, never computed separately (§9, §10)
- [ ] TripEvent fields: type, duty_status, start_time, end_time, duration_minutes, start_location, end_location, distance_miles, reason (§11)
- [ ] Event types are exactly PRE_TRIP_INSPECTION, DRIVING, PICKUP, DROPOFF, FUEL, BREAK, POST_TRIP_INSPECTION, DAILY_REST, CYCLE_RESTART (§12)
- [ ] Duty status enum has exactly OFF_DUTY, SLEEPER_BERTH, DRIVING, ON_DUTY_NOT_DRIVING (§13)
- [ ] Mapping: PRE_TRIP, PICKUP, DROPOFF, FUEL, POST_TRIP map to ON_DUTY_NOT_DRIVING; DRIVING to DRIVING (§14)
- [ ] Mapping: BREAK to OFF_DUTY; DAILY_REST to SLEEPER_BERTH; CYCLE_RESTART to OFF_DUTY (§14) — Test 24
- [ ] constants.py defines MAX_DRIVING_HOURS=11, MAX_DUTY_WINDOW_HOURS=14, REQUIRED_REST_HOURS=10, BREAK_AFTER_DRIVING_HOURS=8, BREAK_DURATION_MINUTES=30 (§31)
- [ ] constants.py defines MAX_CYCLE_HOURS=70, CYCLE_DAYS=8, CYCLE_RESTART_HOURS=34 (§31)
- [ ] constants.py defines MAX_MILES_BETWEEN_FUEL=1000, FUEL_TRIGGER_MILES=950, FUEL_MERGE_THRESHOLD_MILES=600 (§31)
- [ ] constants.py defines PICKUP_DURATION_MINUTES=60, DROPOFF_DURATION_MINUTES=60, FUEL_DURATION_MINUTES=30 (§31)
- [ ] constants.py defines PRE_TRIP_INSPECTION_MINUTES=15, POST_TRIP_INSPECTION_MINUTES=15, TIME_GRID_MINUTES=15 (§31)
- [ ] constants.py defines DAILY_REST_STATUS="SLEEPER_BERTH" and ROUTING_PROFILE="driving-hgv" (§31)
- [ ] No magic numbers in business logic; every regulatory/assumption number comes from constants.py (§31)

### API & errors (§27–§29)
- [ ] `POST /api/trips/plan` exists and accepts current_location, pickup_location, dropoff_location, current_cycle_used, start_datetime, log_details (§27)
- [ ] `GET /api/geocode/autocomplete?q=` exists and proxies ORS so the key never reaches the browser (§27, CLAUDE.md)
- [ ] `GET /api/health` exists and returns 200 (§27)
- [ ] Locations accept optional lat/lng; when present the backend skips geocoding for that location (§27)
- [ ] log_details fields (driver_name, co_driver_name, carrier_name, main_office_address, truck_number, trailer_number, shipping_document) are optional and echoed for the log sheets (§27)
- [ ] Response contains `trip` (distance_miles, driving_hours, elapsed_hours, days, fuel_stops, rest_stops), `route` (geometry, current/pickup/dropoff locations), `events`, `daily_logs` (§28)
- [ ] `trip` summary totals are derived from `events`, never computed separately (§28, CLAUDE.md)
- [ ] Each event serializes type, duty_status, start_time, end_time, duration_minutes, start_location, end_location, distance_miles, reason (§11)
- [ ] All datetimes in the response are timezone-aware, expressed in the home terminal zone (§28, CLAUDE.md)
- [ ] Error: invalid current location returns a structured human-readable message (§29)
- [ ] Error: pickup location not geocodable returns a structured message (§29) — Test 16
- [ ] Error: dropoff location not geocodable returns a structured message (§29) — Test 16
- [ ] Empty location strings are rejected with 400 (§29) — Test 16
- [ ] Error: current_cycle_used outside 0–70 or non-numeric (-5, 72, abc) is rejected; decimals within range accepted (§29) — Test 15
- [ ] Error: routing timeout / 503 / invalid provider payload returns a controlled application error (not 500, no stack trace) (§29) — Test 17
- [ ] Error: no route found returns a structured message (§29)
- [ ] Error: invalid start date/time returns a structured message (§29)
- [ ] No raw stack traces or exception text reach the frontend; unhandled exceptions get a generic JSON error (§29)
- [ ] Current location equal to pickup does not cause a routing error (zero-length leg handled) (§60) — Test 25

### Backend structure & services (§30, §32–§33)
- [ ] `trips/` contains views.py, serializers.py, urls.py and a `tests/` package (replacing default tests.py) (§30)
- [ ] `services/` contains routing_service.py, geocoding_service.py, hos_scheduler.py, eld_service.py, route_position.py (§30)
- [ ] `common/` contains enums.py (event types, four duty statuses, event-to-duty map) and constants.py (§30, §14)
- [ ] constants.py holds all §31 values (limits, durations, fuel thresholds, TIME_GRID_MINUTES, DAILY_REST_STATUS, ROUTING_PROFILE) with no magic numbers in logic (§31)
- [ ] `trips` app and rest_framework registered in INSTALLED_APPS; `trips.urls` included under `api/` in config/urls.py (§27, §30)
- [ ] Routing/geocoding service geocodes addresses and returns distance, duration, geometry, steps for the driving-hgv profile (§32, §31)
- [ ] hos_scheduler.py returns `events[]` only and imports no Django, HTTP, rendering or React concepts (§33) — unit tests run without Django
- [ ] eld_service.py takes `events[]` and returns `daily_logs[]` only (§32, §34)
- [ ] route_position.py finds stop coordinates by elapsed time along steps and reverse geocodes each stop once, cached, concurrently, with fallback (§32, CLAUDE.md) — Test 26
- [ ] Home time zone resolved from current location via timezonefinder (§5.19, CLAUDE.md) — Test 21

### ELD data (§34–§37)
- [ ] Each daily log has date, distance, duty segments, remarks, status totals (§34)
- [ ] Event crossing home-terminal midnight is split into two segments on consecutive days (23:00-03:00 gives 23:00-24:00 and 00:00-03:00) (§35) — Test 11
- [ ] Midnight is computed in the home terminal zone, not the truck's local zone (§35) — Test 21
- [ ] One log per calendar day touched by the trip (§35)
- [ ] Time before trip start on day 1 filled with OFF_DUTY from 00:00 (§36)
- [ ] Time after final event filled with OFF_DUTY to 24:00 (§36)
- [ ] Each log covers a full 24h period (§36)
- [ ] Per-day OFF_DUTY + SLEEPER_BERTH + DRIVING + ON_DUTY_NOT_DRIVING == 24h, enforced by an assertion in code (§37) — Test 12
- [ ] All segment boundaries and row totals are multiples of 15 min / 0.25 h (§5.21) — Test 22
- [ ] Every DAILY_REST maps to SLEEPER_BERTH; CYCLE_RESTART and BREAK map to OFF_DUTY (§14) — Test 24
- [ ] Log header data includes the home terminal time zone (§5.19) — Test 21
- [ ] Daily distance (miles driven that day) computed from the split driving segments (§34)
- [ ] Remarks per day list status changes with location (§34)

### Config & security (§64–§65)
- [ ] settings.py loads .env via python-dotenv (installed, not yet used) (§64)
- [ ] SECRET_KEY read from DJANGO_SECRET_KEY (currently hardcoded insecure key in settings.py) (§64)
- [ ] DEBUG read from DJANGO_DEBUG, default False (currently hardcoded True) (§64)
- [ ] ALLOWED_HOSTS read from env (currently empty list) (§64)
- [ ] ORS_API_KEY read from env and only ever used server-side (§64)
- [ ] `corsheaders` added to INSTALLED_APPS and CorsMiddleware placed before CommonMiddleware (not yet configured) (§65)
- [ ] CORS_ALLOWED_ORIGINS read from env (local + production frontend); CORS_ALLOW_ALL_ORIGINS not enabled (§65)
- [ ] `.env.example` exists with ORS_API_KEY, DJANGO_SECRET_KEY, DJANGO_DEBUG, ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS, VITE_API_BASE_URL (does not exist yet) (§64)
- [x] `.env` is in root .gitignore (also .venv/, __pycache__/, *.pyc, db.sqlite3) (§64)
- [x] `node_modules` ignored via frontend/.gitignore (not in root .gitignore) (§64)
- [ ] No real secrets committed; hardcoded insecure SECRET_KEY removed from settings.py (§64)
- [ ] No database used: DATABASES sqlite config removed or left unused, no models/migrations required (CLAUDE.md)
- [ ] DRF configured: JSON-only renderer, no auth/permission classes needed, custom exception handler for structured errors (§29)
- [x] Dependencies installed in backend/requirements.txt: Django 4.2, DRF, django-cors-headers, timezonefinder, requests, python-dotenv (§30)

### Form & inputs — frontend status (§2–§3, §55)
- [ ] Current, pickup and dropoff fields are required with friendly "not found" errors (§2) — UI done, wire to API (TripFormPanel.tsx:26-30 validates via mock `findPlace`, so it only accepts the 27 hard-coded places)
- [x] Cycle-used validation accepts 0–70 including decimals and rejects -1, 71, abc and empty (§2) (TripFormPanel.tsx:31-32; number input step 0.25 at :171)
- [ ] Trip start date/time input defaults to the current date/time (§3.1) — partial: datetime-local input exists (TripFormPanel.tsx:186) but the default is hard-coded `2026-10-01T06:00` (App.tsx:16)
- [ ] Start timestamp is sent with a UTC offset, never naive (§3.1) — missing: `planTrip` receives the raw `datetime-local` string and sends nothing (api.ts:37)
- [ ] Collapsed "Log details" section with 7 optional fields prefilled with marked demo values (§3.2, §44) — partial: all 7 fields, collapsed, "Demo" tag (TripFormPanel.tsx:19-21,193-209; App.tsx:15), but driver and co-driver are never printed on the sheet (see Log sheet UI)
- [ ] Autocomplete calls ORS via Django, debounced about 300 ms, min 3 chars, biased to US (§55) — UI done, wire to API (min 3 chars at api.ts:22 and TripFormPanel.tsx:108; list UI with keyboard nav at :111-158; data is a mock prefix match, no debounce, no US bias)
- [ ] Selected suggestion's coordinates are kept and sent with the plan request (§55) — missing: the form stores only the label string (types/trip.ts `TripForm`, App.tsx:60)
- [ ] Home terminal time zone shown on the form comes from the API (§5.19, §3) — UI done, wire to API (TripFormPanel.tsx:75-76,189 reads the hard-coded `TZ` table)

### Log sheet UI (§38–§44)
- [x] SVG sheet has four rows: Off Duty, Sleeper Berth, Driving, On Duty (Not Driving) (§38, §39) (LogSheet.tsx:76-91)
- [x] 15-minute ticks: full-height hour lines, taller half-hour tick, short quarter ticks (§40) (LogSheet.tsx:85-92)
- [ ] x = minutesSinceMidnight / 1440 * graphWidth, so 06:00–12:00 maps to 25%–50% (§40, Test 13) — partial: `xs` is correct (LogSheet.tsx:26) but is a closure inside the component and has no unit check
- [x] One continuous status line with vertical transitions between rows (§41) (LogSheet.tsx:96-100; row Y from `STATUS[...].row`)
- [ ] Hour labels read Midnight, 1…11, Noon, 13…23, Midnight (§43) — partial: "Mid-/night" and "Noon" are present, but hours after noon print 1–11 instead of 13–23 (LogSheet.tsx:62-63)
- [ ] Totals column in quarter-hour format with a computed "= 24" check, asserted (§43, §5.21) — partial: per-row totals via `qh` (LogSheet.tsx:90), but "= 24" is a hard-coded string (:93) and nothing asserts the sum
- [x] Remarks area has a bracket per non-driving stop and a 45° rotated location label, staggered when close (§42) (LogSheet.tsx:109-137; no truncation, only stagger)
- [ ] Readable remarks list under the sheet (time, location, activity) from the same events as the map (§42) — UI done, wire to API (Results.tsx:273-286, fed by mock events)
- [ ] Header has date, total miles, vehicle numbers, From/To, carrier, main office, time zone (§43) — UI done, wire to API (LogSheet.tsx:40-55; From/To at :46-47; zone at :45 from `trip.tzName`)
- [ ] Header has name of co-driver and driver name — missing: `lg.driver` and `lg.codriver` are never rendered in LogSheet.tsx
- [ ] Driver certification line ("I certify that these entries are true and correct" + driver name) — missing
- [ ] Shipping document number or shipper and commodity at the bottom (§43) — partial: shipping doc rendered (LogSheet.tsx:140-142) but it is not in the plan request/response
- [x] "Demo values" note on the sheet when defaults are in use (§44) (LogSheet.tsx:163-166; `demo` flag at App.tsx:28)
- [ ] README documents the demo values (§44) — missing

### Results layout & map (§45–§47)
- [ ] Desktop layout: summary cards, then map beside timeline, then daily logs (§45) — UI done, wire to API (Results.tsx:93-291; 3fr/2fr grid at :152)
- [ ] Route is drawn from ORS geometry (§25, §45) — missing: RouteMap draws a straight Polyline between place centroids (RouteMap.tsx:53-59); the response has no geometry field yet
- [ ] Markers for current location, pickup, dropoff, fuel, break, 10-hour rest, 34-hour restart, each with a distinct icon and color (§46) — UI done, wire to API (KIND table utils/trip.ts:16-31; marker HTML RouteMap.tsx:20-28; current location shares the "Start · Pre-trip" marker; break and restart both use grey, distinguished by icon and ring)
- [ ] Marker position comes from interpolated stop coordinates (§25) — missing: positions are looked up by city name in `trip.places` (RouteMap.tsx:35,64)
- [ ] Popup shows title, location, arrival, duration and duty status (§47) — UI done, wire to API (RouteMap.tsx:68-87; also local-time line via `TZ`)

### Timeline & summary (§48–§49)
- [ ] Timeline generated from the canonical event list, one row per event with time and label (§48) — UI done, wire to API (Results.tsx:162-211)
- [ ] Summary shows total distance, raw driving time, total trip time, estimated arrival (§49) — UI done, wire to API (utils/trip.ts:121-126)
- [ ] Summary shows fuel stops, breaks and daily rests as fields (§49) — partial: only a combined "Stops" card with counts in its subtext and in the banner (utils/trip.ts:126,112-117)
- [ ] Summary shows cycle used and cycle remaining as `max(0, 70 - cycleUsed)` (§49, §5.15) — partial: one "Cycle at end" card (utils/trip.ts:127) uses `70 - cyc` without the `max(0, …)` clamp; the initial cycle shows only in the header (Results.tsx:73)

### Day navigation & print (§50)
- [ ] Day tabs show date, total miles, graph, remarks and status totals per day (§50) — UI done, wire to API (Results.tsx:231-290)
- [x] "Show all days" stacked view in addition to tabs (§50) (Results.tsx:222-226)
- [x] Print stylesheet: one sheet per page, app chrome hidden, `@page` letter (§50) (index.css:187-192; PrintView.tsx:14-23; last page also carries `break-after`, which may add a blank trailing page — not verified in a browser)
- [x] "Print all logs" and "Print this day" buttons using `window.print()` (§50) (Results.tsx:227-228; PrintView.tsx:12)
- [ ] Optional per-day SVG/PNG download (§50) — missing (optional)

### UX states (§51–§54)
- [ ] Layout works at desktop, tablet and mobile widths (§51) — missing: index.css has no width `@media` rules (only `prefers-reduced-motion` at :23 and `print` at :187); fixed 440px form column (App.tsx:115), 3fr/2fr map grid at 620px (Results.tsx:152), 480px drawer (index.css:105), 5-column checks grid
- [x] Loading state "Planning…" with staged progress (§52) (PlannerPane.tsx:31-57; stages are timer-faked at App.tsx:38, and the step list text is "Finding truck route / Applying hours-of-service rules / Drawing daily logs")
- [x] After about 5 s the UI shows "Waking up the server: the first request can take up to a minute" (§52) (App.tsx:38; PlannerPane.tsx:48-52)
- [ ] `GET /api/health` fired on page load to wake the server (§52) — missing
- [x] Empty state with explanatory text before a trip is planned (§53) (PlannerPane.tsx:11-23; its ghost log sheet uses mockData, which goes away with the mock)
- [ ] Three sample presets match §53 (§53) — partial: three chips exist (mockData.ts:27-94) but they differ: Short is Dallas > Fort Worth > Austin cycle 10 (fine); "Multi-day haul" is Newark > Philadelphia > Denver cycle 18, not Boston > Chicago > Los Angeles cycle 15; "Near cycle limit" is cycle 62, not 65
- [ ] Friendly error states, never raw backend JSON (§54) — UI done, wire to API (PlanError kinds noRoute/unavailable/timeout/unexpected at api.ts:5-13; messages PlannerPane.tsx:84-85; no-route notice TripFormPanel.tsx:80-89; nothing maps real HTTP errors yet)

### Frontend structure & state (§56–§58)
- [x] Vite + React + TypeScript with react-leaflet, hand-written SVG, no chart library (§56) (package.json; RouteMap.tsx:1-4; LogSheet.tsx)
- [x] Plain React state, no Redux; form, loading, error and trip result held in App (§57) (App.tsx:24-34)
- [ ] `services/api.ts` calls the real backend using `VITE_API_BASE_URL` (§56) — UI done, wire to API: api.ts is a mock with a 2.1 s fake delay and a fixture lookup (:36-42)
- [ ] Frontend consumes canonical `TripEvent[]` (ISO datetimes, `DRIVING`, `ON_DUTY_NOT_DRIVING`, …) (§11–§14, §27–§28) — missing: view model uses `RawEvent {s,e,st,k,loc,mi}` hour offsets with `off|sb|d|on` (types/trip.ts, utils/trip.ts:46-56)
- [ ] mockData removed from the production path (§56) — missing: imported by api.ts, App.tsx:10, TripFormPanel.tsx:4, PlannerPane.tsx:2
- [x] No database or persistence on the frontend (§58)
- [ ] Frontend tests exist (§60 Test 13) — missing: no vitest config or test files

### README (§61–§63, §76)
- [ ] Project purpose (§61)
- [ ] Screenshots (§61)
- [ ] Architecture (§61)
- [ ] Setup instructions (§61)
- [ ] Frontend setup (§61)
- [ ] Backend setup (§61)
- [ ] Environment variables (§61)
- [ ] Routing API setup (§61)
- [ ] HOS rules implemented (§61)
- [ ] Assumptions (§61)
- [ ] Limitations (§61)
- [ ] Test commands (§61)
- [ ] Deployment (§61)
- [ ] Live URL (§61)
- [ ] Loom URL (§61)
- [ ] README assumption: Property-carrying driver (§62)
- [ ] README assumption: 70-hour/8-day cycle (§62)
- [ ] README assumption: No adverse conditions (§62)
- [ ] README assumption: Driver starts with fresh 11-hour and 14-hour clocks (§62)
- [ ] README assumption: Truck starts with a full tank (§62)
- [ ] README assumption: 10-hour continuous daily rest, logged as Sleeper Berth (§62)
- [ ] README assumption: No split sleeper optimization (§62)
- [ ] README assumption: Any 30+ minute non-driving period satisfies the 30-minute break (§62)
- [ ] README assumption: Fuel interval <= 1,000 miles (forced at 950; merged with breaks after 600) (§62)
- [ ] README assumption: Fuel duration assumed to be 30 minutes (§62)
- [ ] README assumption: Pickup duration = 1 hour (§62)
- [ ] README assumption: Dropoff duration = 1 hour (§62)
- [ ] README assumption: Pre-trip and post-trip inspections = 15 minutes each (§62)
- [ ] README assumption: Home terminal time zone = current location's time zone (§62)
- [ ] README assumption: Log day starts at midnight, home terminal time (§62)
- [ ] README assumption: All times on a 15-minute grid; drive times rounded up (§62)
- [ ] README assumption: Truck (HGV) routing durations (§62)
- [ ] README assumption: Trip start defaults to current time unless explicitly provided (§62)
- [ ] README assumption: Rolling 8-day history is unavailable; no hours roll off during the trip (§62)
- [ ] README assumption: 34-hour restart is used when the cycle is exhausted and more driving is needed (§62)
- [ ] README assumption: Missing carrier/driver fields use clearly marked demo values (§62)
- [ ] README limitation: No split sleeper berth optimization (§63)
- [ ] README limitation: No adverse-driving exception (§63)
- [ ] README limitation: No short-haul exceptions (§63)
- [ ] README limitation: No personal conveyance support (§63)
- [ ] README limitation: No yard move support (§63)
- [ ] README limitation: No actual ELD device integration (§63)
- [ ] README limitation: No historical 8-day duty record input (§63)
- [ ] README limitation: DST transition days (23/25-hour calendar days) (§63)
- [ ] README limitation: Hours never roll off during the trip (conservative cycle handling) (§63)
- [ ] README limitation: Fuel stops placed on the route, not at actual fuel stations (§63)
- [ ] README and Loom state the 10 review assumptions (§76)

### Deployment (§66–§67)
- [ ] React frontend → Vercel (§66)
- [ ] Django backend → Render / Railway / similar Python host (§66)
- [ ] Form submission (§67)
- [ ] Map rendering (§67)
- [ ] Short trip (§67)
- [ ] Long trip (§67)
- [ ] Cycle-near-limit trip (§67)
- [ ] Multi-day ELD logs (§67)
- [ ] Responsive layout (§67)
- [ ] Browser console (§67)
- [ ] API network calls (§67)
- [ ] CORS (§67)
- [ ] HTTPS (§67)
- [ ] Refresh behavior (§67)
- [ ] Invalid input (§67)
- [ ] Incognito/private browsing (§67)
- [ ] First request after the backend has been idle (cold start) (§67)
- [ ] Long trip crossing time zones — logs stay in home terminal time (§67)
- [ ] Sample trip buttons all work (§67)
- [ ] Print / PDF output of the log sheets (§67)
- [ ] Autocomplete responds and does not leak the API key (§67)

### Repo & git (§68–§69)
- [ ] GitHub repo structure matches §68 (§68)
- [ ] Do not commit: node_modules (§68)
- [ ] Do not commit: venv (§68)
- [ ] Do not commit: .env (§68)
- [ ] Do not commit: API secrets (§68)
- [ ] Do not commit: local cache files (§68)
- [ ] Git commits follow meaningful patterns (§69)
- [ ] Sample commits include features, tests, and style (§69)

### Submission (§70, §77)
- [ ] Loom: Minute 0–1 — Explain what the app does, required inputs, route planning, HOS compliance, ELD generation (§70)
- [ ] Loom: Minute 1–2 — Run a sample trip; show route, fuel stops, breaks, rest stops, estimated timing (§70)
- [ ] Loom: Minute 2–3 — Show daily ELD logs, multiple days, duty status lines, remarks, daily totals (§70)
- [ ] Loom: Minute 3–4 — Open hos_scheduler.py; explain 11-hour rule, 14-hour rule, 8-hour break, 10-hour reset, 70-hour cycle, 34-hour restart (§70)
- [ ] Loom: Minute 4–5 — Explain architecture: one canonical event timeline, same events power map + ELD + timeline, services separated, tests cover HOS edge cases (§70)
- [ ] Key message: The routing service tells us where the truck needs to go and the raw travel duration. The HOS scheduler turns that raw route into a legally compliant sequence of trip events. That single event timeline becomes the source of truth for the route map, stop markers, trip timeline, summary, and ELD daily logs. (§77)

## Part B — Tasks

### Phase 1 — Project setup (§71)

#### T1. Django settings, env, CORS, health endpoint
- [ ] Settings read all env vars via python-dotenv, CORS locked to configured origins, DRF + trips registered, `.env.example` written, `GET /api/health` returns 200
- Files: backend/config/settings.py, backend/config/urls.py, backend/trips/urls.py, backend/trips/views.py, backend/.env.example (or repo-root .env.example), .gitignore
- Spec: §27, §64, §65
- Tests: none (manual curl of /api/health plus a trivial Django test client check)

### Phase 2 — Routing (§71)

#### T2. Constants and enums
- [ ] `constants.py` with every §31 value; `enums.py` with EventType, DutyStatus and the event-to-duty map (§14)
- Files: backend/common/constants.py, backend/common/enums.py, backend/trips/tests/test_enums.py
- Spec: §12, §13, §14, §31
- Tests: Test 24 (mapping part: DAILY_REST is SLEEPER_BERTH)

#### T3. Geocoding service and autocomplete proxy
- [ ] ORS geocode + autocomplete wrapper with timeout and error mapping; `GET /api/geocode/autocomplete?q=` returns label/lat/lng suggestions; coordinate-bearing locations skip geocoding
- Files: backend/services/geocoding_service.py, backend/trips/views.py, backend/trips/urls.py, backend/trips/tests/test_geocode.py
- Spec: §27, §29, §32, §64
- Tests: 16 (unresolvable location mapped to structured error, with mocked ORS)

#### T4. Routing service (ORS driving-hgv, per-leg fallback)
- [ ] `route(waypoints)` returns distance, duration, geometry, steps per leg using driving-hgv; zero-length legs short-circuited; provider timeout/503/bad payload/no route raise typed errors; per-leg fallback when a combined call fails
- Files: backend/services/routing_service.py, backend/common/errors.py, backend/trips/tests/test_routing_service.py
- Spec: §29, §31, §32, Test 17, Test 25
- Tests: 17, 25 (routing half: no error when current == pickup)

#### T5. Home terminal time zone resolution
- [ ] `home_timezone(lat, lng)` returns a ZoneInfo via timezonefinder, with a documented fallback; start_datetime parsed/localized into that zone
- Files: backend/services/timezone_service.py (or inside geocoding_service.py), backend/trips/tests/test_timezone.py
- Spec: §5.19, §29 (invalid start datetime)
- Tests: 21 (zone part: New York current location gives America/New_York)

### Phase 3 — HOS engine (§71)

#### T6. TripEvent and scheduler state types
- [ ] Framework-free TripEvent and SchedulerState dataclasses with the §11 and §15 fields, tz-aware datetimes only
- Files: backend/services/hos_scheduler.py
- Spec: §11, §15, §5.19, §9
- Tests: none

#### T7. Starting state and 15-min grid helpers
- [ ] `init_state` (§5.20 values, start rounded up to 15 min, converted to home zone) and rounding helpers (up for waypoint segments, down for fuel-cut segments)
- Files: backend/services/hos_scheduler.py, backend/trips/tests/test_scheduler_grid.py
- Spec: §5.20, §5.21, §3.1, §5.19
- Tests: Test 22 (start/grid part)

#### T8. Event emitter, duty-window and cycle accounting, and inspections
- [ ] `add_event` that advances time and updates cycleUsed, dutyWindowStart (set by first work event), contiguousNonDrivingMinutes/drivingSinceBreak per §5.6; pre-trip at trip start and post-trip at trip end
- Files: backend/services/hos_scheduler.py, backend/trips/tests/test_scheduler_core.py
- Spec: §5.6, §5.7, §5.18, §5.2, §5.13
- Tests: Test 23 (partial), Test 1

#### T9. Drive-segment calculator and 11h limit
- [ ] `allowed_drive_minutes` (§17 min of constraints with rounding) and driving loop; 11h cap forces POST_TRIP, 10h DAILY_REST (Sleeper), PRE_TRIP with reset of counters
- Files: backend/services/hos_scheduler.py, backend/trips/tests/test_scheduler_11h.py
- Spec: §5.1, §5.4, §5.5, §16, §17, §22
- Tests: Test 3, Test 24, Test 23

#### T10. 14-hour window (driving-only check)
- [ ] 14h window expiry blocks driving only and triggers the rest sequence; verify no driving past window and non-driving work still allowed
- Files: backend/services/hos_scheduler.py, backend/trips/tests/test_scheduler_14h.py
- Spec: §5.2, §5.3, §19, §22
- Tests: Test 4

#### T11. 8h driving / 30-min break
- [ ] BREAK (30 min, Off Duty) inserted only when 8h driving accrues with no qualifying >= 30 min non-driving period since
- Files: backend/services/hos_scheduler.py, backend/trips/tests/test_scheduler_break.py
- Spec: §5.6, §5.7, §23
- Tests: Test 2, Test 1

#### T12. Pickup event and break reset
- [ ] PICKUP (60 min on duty, cycle +1h, drivingSinceBreak = 0, never blocked) and the current-equals-pickup case
- Files: backend/services/hos_scheduler.py, backend/trips/tests/test_scheduler_pickup.py
- Spec: §5.8, §20, §18
- Tests: Test 5, Test 18, Test 25

#### T13. Dropoff and trip finish
- [ ] DROPOFF (60 min) + POST_TRIP (15 min), cycle +1.25h, never blocked by expired window or exhausted cycle, no rest/restart before it
- Files: backend/services/hos_scheduler.py, backend/trips/tests/test_scheduler_dropoff.py
- Spec: §5.9, §21, §22, §5.2, §5.13
- Tests: Test 6, Test 19, Test 20

#### T14. 70-hour cycle and 34-hour restart
- [ ] Cycle check before driving; exhausted cycle produces POST_TRIP, CYCLE_RESTART (34h Off Duty), PRE_TRIP; restart wins over 10h rest; input 70 starts with restart; display max(0, 70 - cycleUsed)
- Files: backend/services/hos_scheduler.py, backend/trips/tests/test_scheduler_cycle.py
- Spec: §5.13, §5.14, §5.15, §5.16, §17, §19, §22
- Tests: Test 9, Test 10, Test 20

#### T15. Fuel trigger and break/fuel merge
- [ ] FUEL (30 min) forced at 950 mi with fuel-cut segments rounded down; at a due break with milesSinceFuel >= 600 insert FUEL instead of BREAK; fuel resets milesSinceFuel and drivingSinceBreak
- Files: backend/services/hos_scheduler.py, backend/trips/tests/test_scheduler_fuel.py
- Spec: §5.10, §5.11, §5.12, §24, §26, §5.21
- Tests: Test 7, Test 8, Test 14, Test 27

#### T16. Full-trip scheduler assembly and invariants
- [ ] `plan_schedule(legs, cycle_used, start, home_tz)` runs current to pickup to dropoff and a property test asserts grid multiples, tz-aware times, 24h-per-day sums and inspection bookending
- Files: backend/services/hos_scheduler.py, backend/trips/tests/test_scheduler_invariants.py
- Spec: §6, §18, §5.19, §5.21, §10
- Tests: Test 12, Test 21 (scheduler part), Test 22, Test 23, Test 1

### Phase 4 — Canonical events and stop positions (§71)

#### T17. Route position interpolation
- [ ] `position_at(steps, geometry, elapsed_minutes)` mapping elapsed driving time to lat/lon via per-step time fraction and haversine polyline walk, returning cumulative miles
- [ ] Reverse geocode each stop once, cached by rounded coordinates, concurrently, with a coordinate-label fallback (§25)
- Files: backend/services/route_position.py, backend/trips/tests/test_route_position.py
- Spec: §25, §26
- Tests: Test 26

### Phase 5 — ELD data and plan endpoint (§71)

#### T18. ELD generator
- [ ] `generate_daily_logs(events, home_tz)` splits at home midnight, fills to 24h with OFF_DUTY, snaps to the 15-min grid, emits segments, status totals, remarks, daily miles, and asserts the 24h sum
- Files: backend/services/eld_service.py, backend/trips/tests/test_eld_service.py
- Spec: §34, §35, §36, §37, §14, §5.19, §5.21
- Tests: 11, 12, 21 (day-split and header zone), 22 (row/grid part), 24

#### T19. Serializers and plan view with structured errors
- [ ] Request serializer validates locations, cycle 0–70 (decimals ok), start_datetime, log_details; custom exception handler returns `{error: {code, message}}` for every §29 case; no stack traces
- Files: backend/trips/serializers.py, backend/trips/views.py, backend/trips/exceptions.py, backend/config/settings.py (EXCEPTION_HANDLER), backend/trips/tests/test_plan_api.py
- Spec: §27, §29
- Tests: 15, 16, 17

#### T20. Response assembly and end-to-end plan endpoint
- [ ] Plan view wires geocode, route, home zone, hos_scheduler, route_position, eld_service; assembles trip summary (distance, driving_hours, elapsed_hours, days, fuel_stops, rest_stops) from events only; returns `trip`/`route`/`events`/`daily_logs`
- Files: backend/trips/views.py, backend/trips/serializers.py (response), backend/trips/tests/test_plan_api.py
- Spec: §28, §32, §33, CLAUDE.md core architecture
- Tests: 21, 25 (end to end with mocked ORS), 12, 22 (assertions on full response)

### Phases 6–9 — Frontend: mock to real, then gaps (§71)

#### T21. API client with base URL and error mapping
- [ ] Replace the mock `planTrip` with `fetch` to `${VITE_API_BASE_URL}/api/trips/plan`, with a timeout, mapping 404/422 route errors to `noRoute`, 5xx/network to `unavailable`, abort to `timeout`, anything else to `unexpected`, and never surfacing raw JSON; add `.env.example` entry
- Files: frontend/src/services/api.ts, frontend/.env.example
- Spec: §27, §28, §54, §56
- Tests: none

#### T22. Adapter from API response to the existing view model
- [ ] Add `fromApi(resp)` that converts `TripEvent[]` (ISO datetimes, API duty statuses, event types) into the existing `TripDef`/`RawEvent` shape (hour offsets from day-1 home-terminal midnight, `off|sb|d|on`, `Kind`), then reuse `derive()` unchanged; carry per-event lat/lng and daily-log totals through, and clamp cycle remaining at 0
- Files: frontend/src/utils/adapter.ts (new), frontend/src/types/trip.ts, frontend/src/utils/trip.ts, frontend/src/services/api.ts
- Spec: §11–§14, §27, §28, §49
- Tests: none

#### T23. Time zone from the API
- [ ] Take zone name, abbreviation and per-stop UTC offset from the response and drop the hard-coded `TZ` table and the `tzOffset` integer on places; update the form helper text, the popup local-time line and the arrival card
- Files: frontend/src/utils/trip.ts, frontend/src/components/TripFormPanel.tsx, frontend/src/components/RouteMap.tsx, frontend/src/types/trip.ts
- Spec: §5.19, §47, §49
- Tests: none

#### T24. Route polyline and marker positions from API
- [ ] Draw the route from the ORS geometry in the response (split at pickup for the empty/loaded styling) and place markers at the API's interpolated stop coordinates instead of `trip.places[name]`; fit bounds to the geometry
- Files: frontend/src/components/RouteMap.tsx, frontend/src/types/trip.ts, frontend/src/utils/adapter.ts
- Spec: §25, §45, §46
- Tests: none

#### T25. Send departure time with UTC offset
- [ ] Default departure to the current local time and serialise it as ISO-8601 with offset (e.g. `2026-10-01T08:00:00-04:00`) in the plan request
- Files: frontend/src/App.tsx, frontend/src/services/api.ts, frontend/src/types/trip.ts
- Spec: §3.1
- Tests: none

#### T26. Real autocomplete with coordinates
- [ ] `suggest()` calls `GET /api/geocode/autocomplete?q=` after about 300 ms debounce and 3+ chars, ignores stale responses, and returns label plus coordinates; the form keeps the picked suggestion's coordinates and sends them with the plan request; replace the `findPlace`-based validation with "a suggestion was picked or free text will be geocoded server-side"
- Files: frontend/src/services/api.ts, frontend/src/components/TripFormPanel.tsx, frontend/src/types/trip.ts, frontend/src/App.tsx
- Spec: §2, §55
- Tests: none

#### T27. Health ping on load
- [ ] Fire `GET /api/health` once on mount (failures ignored) to wake a sleeping backend; keep the existing 5-second "Waking up the server" message on the plan request
- Files: frontend/src/App.tsx, frontend/src/services/api.ts
- Spec: §52
- Tests: none

#### T28. Log sheet completeness and Test 13 unit check
- [ ] Render driver name, co-driver, certification line, and 13–23 hour labels; compute the "= 24" check from the row totals and assert it; extract the x-coordinate function out of the component so a unit test can import it, then add a vitest check that 06:00 and 12:00 land at 25% and 50% of graph width
- Files: frontend/src/components/LogSheet.tsx, frontend/src/utils/logGeometry.ts (new), frontend/src/utils/logGeometry.test.ts (new), frontend/package.json
- Spec: §40, §43, §44
- Tests: 13

#### T29. Summary cards per §49
- [ ] Split the combined "Stops" card into Fuel Stops, Breaks and Daily Rests, and show Cycle Used (input) and Cycle Remaining as `max(0, 70 - cycleUsed)`
- Files: frontend/src/utils/trip.ts, frontend/src/components/Results.tsx
- Spec: §49, §5.15
- Tests: none

#### T30. Responsive layout for tablet and mobile
- [ ] Add breakpoints (for example 1024 px and 640 px) that stack the form above the hero, the map above the timeline, shrink the map height, collapse the stats, checks and day-stats grids, make the drawer full width, and let the log sheet scroll or scale horizontally
- Files: frontend/src/index.css, frontend/src/App.tsx, frontend/src/components/Results.tsx
- Spec: §51
- Tests: none

#### T31. Align sample presets with the spec and remove mockData
- [ ] Make the three chips plain form presets (short single-day; Boston, MA > Chicago, IL > Los Angeles, CA at cycle 15; cycle 65) that fill the form and call the real API; delete `mockData.ts` and the fixture imports, and replace the ghost sheet in `EmptyHero` with a small static fixture or none; clean up `PRINT` last-page break and add the demo-values note to the README
- Files: frontend/src/services/mockData.ts (delete), frontend/src/App.tsx, frontend/src/components/TripFormPanel.tsx, frontend/src/components/PlannerPane.tsx, frontend/src/services/api.ts, README.md
- Spec: §44, §53, §56
- Tests: none

### Phase 10 — Testing (§71)

#### T32. Full test suite green
- [ ] All 27 tests in the matrix below exist and pass (`python manage.py test` in backend, `npx vitest run` in frontend)
- Files: backend/trips/tests/, frontend/src/utils/logGeometry.test.ts
- Spec: §59, §60
- Tests: 1–27

### Phase 11 — Deployment (§71)

#### T33. Deploy
- [ ] Frontend to Vercel
- [ ] Backend to always-on Python host (Render/Railway/similar)
- [ ] Production CORS configured (frontend + backend origins)
- [ ] Run §67 production verification checks
- Files: `frontend/`, `backend/`, `.env.example`
- Spec: §66, §67
- Tests: none

### Phase 12 — Submission (§71)

#### T34. README
- [ ] Write README.md at repo root
- [ ] Cover §61 required sections
- [ ] Document §62 assumptions (each line, one bullet)
- [ ] Document §63 limitations (each line, one bullet)
- [ ] List §76 review assumptions (all 10)
- Files: `README.md`
- Spec: §61, §62, §63, §76
- Tests: none

#### T35. Submission
- [ ] Clean up GitHub repo (no uncommitted changes)
- [ ] Record Loom video 3–5 minutes (§70 content)
- [ ] Verify live URLs work (frontend + backend + README link + Loom link)
- [ ] Final end-to-end trip test in production
- Files: GitHub repo link, Loom link
- Spec: §68, §69, §70, §77
- Tests: none

## Part C — Test matrix (§60)

| # | Name | Asserts (one line) | Target module | Tasks |
|---|------|--------------------|---------------|---|
| 1 | Short Trip | 5h driving, cycle 0: no break, no daily rest, no fuel | hos_scheduler | T8, T11, T16 |
| 2 | Eight-Hour Break Threshold | 10h single driving leg gives 8h drive, 30m BREAK, 2h drive; no break if a 30+ min non-driving period precedes hour 8 | hos_scheduler | T11 |
| 3 | Eleven-Hour Driving Limit | 15h raw driving caps at 11h, then 10h rest, then remainder, respecting 14h window | hos_scheduler | T9 |
| 4 | 14-Hour Window | With 1h pickup and other non-driving events, no driving occurs after the window expires | hos_scheduler | T10 |
| 5 | Pickup | PICKUP is 1h, ON_DUTY_NOT_DRIVING, cycle used increases 1h | hos_scheduler | T12 |
| 6 | Dropoff | DROPOFF is 1h, ON_DUTY_NOT_DRIVING, cycle used increases 1h | hos_scheduler | T13 |
| 7 | Fuel | 1,500-mile trip has at least one FUEL before 1,000 miles | hos_scheduler | T15 |
| 8 | Long Fuel Route | 2,600-mile trip has at least two FUEL stops | hos_scheduler | T15 |
| 9 | Cycle Near Limit | Cycle 68h, 1h pickup + 2h driving: scheduler never drives past cycle availability | hos_scheduler | T14 |
| 10 | 34-Hour Restart | Cycle 70 gives CYCLE_RESTART 34h, then PRE_TRIP, then driving | hos_scheduler | T14 |
| 11 | Midnight Crossing | Event 23:00-03:00 splits into 23:00-24:00 and 00:00-03:00 on two days | eld_service | T18 |
| 12 | Daily Log Totals | For every generated day, the four status durations sum to exactly 24h | eld_service | T16, T18, T20 |
| 13 | ELD Coordinates | 06:00-12:00 driving maps to x = 25% to 50% of graph width | frontend | T28 |
| 14 | Fuel + Break Overlap | Fuel due when break due yields one 30m FUEL, no extra BREAK | hos_scheduler | T15 |
| 15 | Invalid Cycle Hours | -5, 72, abc rejected | serializers/views | T19 |
| 16 | Invalid Locations | Empty or unresolvable locations rejected or handled gracefully with structured error | serializers/views | T3, T19 |
| 17 | Routing API Failure | Timeout, 503, invalid provider response return a controlled application error | routing_service | T4, T19 |
| 18 | Pickup Satisfies the Break | 5h drive, 1h pickup, long leg: no BREAK before next 8h of driving (11h/14h bind first) | hos_scheduler | T12 |
| 19 | Dropoff After the 14-Hour Window | Arrival at window expiry gives DROPOFF, POST_TRIP, end; no DAILY_REST before dropoff | hos_scheduler | T13 |
| 20 | Dropoff With Cycle Exhausted | Cycle remaining 0 at dropoff gives DROPOFF, POST_TRIP, end; no CYCLE_RESTART | hos_scheduler | T13, T14 |
| 21 | Home Terminal Time Zone | NY to Chicago to LA: times in America/New_York, days split at Eastern midnight, header shows zone | eld_service | T5, T16, T18, T20 |
| 22 | Quarter-Hour Grid | Every event boundary multiple of 15 min, row totals multiples of 0.25h, rows sum to 24 | eld_service | T7, T16, T18, T20 |
| 23 | Inspections | Each duty period starts with PRE_TRIP and ends with POST_TRIP; post-trip after hour 14 allowed | hos_scheduler | T8, T9, T16 |
| 24 | Sleeper Berth Rest | Every DAILY_REST is on the SLEEPER_BERTH row | eld_service | T2, T9, T18 |
| 25 | Current Location Equals Pickup | No routing error; PRE_TRIP, PICKUP, then driving to dropoff | routing_service | T4, T12, T20 |
| 26 | Time-Based Position Interpolation | Step A 100mi/1.5h, step B 20mi/1h, stop at 2h falls in step B about 10mi in | route_position | T17 |
| 27 | Fuel Merge at Break | Break due at 8h with milesSinceFuel 620 gives one 30m FUEL, no BREAK, counters reset to 0 | hos_scheduler | T15 |

## Part D — Definition of done (§75, verbatim)

Final sign-off list. Tick these last, once the matching Part A items are done.

### Core App
- [ ] React frontend works
- [ ] Django API works
- [ ] Current → Pickup → Dropoff routing works
- [ ] Free map/routing service is integrated

### HOS Rules
- [ ] 11-hour driving limit works
- [ ] 14-hour duty window works
- [ ] 8-hour driving break rule works
- [ ] 30-minute break works
- [ ] 10-hour reset works
- [ ] 70-hour cycle works
- [ ] 34-hour restart works
- [ ] Pickup = 1 hour
- [ ] Dropoff = 1 hour
- [ ] Fuel before 1,000 miles
- [ ] Fuel counts as on-duty
- [ ] Fuel can satisfy break when valid

### Timeline
- [ ] Trip events have start times
- [ ] Trip events have end times
- [ ] Trip events have locations
- [ ] Trip events have duty statuses
- [ ] Midnight splitting works

### ELD
- [ ] Multiple daily logs work
- [ ] Each daily log covers 24 hours
- [ ] Each daily log totals 24 hours
- [ ] Four duty-status rows render
- [ ] Horizontal duty lines render
- [ ] Vertical transitions render
- [ ] Remarks show locations
- [ ] Daily miles display correctly

### Map
- [ ] Route displays
- [ ] Current location marker displays
- [ ] Pickup marker displays
- [ ] Dropoff marker displays
- [ ] Fuel markers display
- [ ] Break markers display
- [ ] Rest markers display
- [ ] Cycle restart markers display

### Consistency
- [ ] Map matches timeline
- [ ] Timeline matches ELD
- [ ] ELD matches backend events
- [ ] Summary totals come from backend events

### Validation
- [ ] Invalid cycle input handled
- [ ] Invalid locations handled
- [ ] API failures handled
- [ ] Routing failures handled

### UI / UX
- [ ] Loading state exists
- [ ] Error state exists
- [ ] Empty state exists
- [ ] Desktop UI is polished
- [ ] Responsive behavior is acceptable
- [ ] Icons do not rely only on color

### Security / Configuration
- [ ] No secrets are committed
- [ ] `.env.example` exists
- [ ] `.gitignore` is correct
- [ ] CORS is configured

### Documentation
- [ ] README explains setup
- [ ] README explains architecture
- [ ] README lists assumptions
- [ ] README lists limitations
- [ ] README includes live URL
- [ ] README includes Loom URL

### Testing
- [ ] HOS tests pass
- [ ] ELD tests pass
- [ ] Midnight splitting tests pass
- [ ] Cycle restart tests pass
- [ ] Fuel/break overlap tests pass

### Deployment
- [ ] Production frontend works
- [ ] Production backend works
- [ ] Production CORS works
- [ ] HTTPS works
- [ ] App works in incognito/private browser

### Submission
- [ ] GitHub repo is shareable
- [ ] Live app is reachable
- [ ] Loom is 3–5 minutes
- [ ] Final example trip works end to end

### Review Fixes
- [ ] Any 30+ minute non-driving period resets the break clock
- [ ] 14-hour and 70-hour checks apply only before driving
- [ ] Dropoff is never preceded by an unnecessary rest or restart
- [ ] All times in the home terminal time zone, shown on each sheet
- [ ] HGV routing profile used
- [ ] Stop positions interpolated by time along route steps
- [ ] Pre/post-trip inspections on every duty period
- [ ] Daily rest on the Sleeper Berth row
- [ ] All event boundaries on a 15-minute grid
- [ ] Full log sheet: header, grid, totals column, remarks brackets
- [ ] Header fields filled (demo values marked)
- [ ] Sample trip buttons
- [ ] Print / PDF output
- [ ] Cold start handled
- [ ] Autocomplete proxied (no key in browser, no public Nominatim)

