# Full-Stack Developer Assessment — Complete Implementation Plan

> **Revision 2 — HOS accuracy and log-sheet fidelity review.** Main changes:
> any 30+ minute non-driving period resets the 8-hour break clock (§5.6);
> the 14-hour window and 70-hour cycle restrict driving only, not on-duty work (§5.2, §5.13, §19);
> home-terminal time zone handling (§5.19); HGV routing via OpenRouteService (§7, §8);
> time-based route interpolation (§25); pre/post-trip inspections (§5.18);
> 10-hour rest logged as Sleeper Berth (§5.5); quarter-hour time grid (§5.21);
> full FMCSA paper log sheet layout with filled header fields (§43, §44);
> sample trips, print/export, and backend cold-start handling (§50, §52, §53);
> new test cases 18–27 (§60).


## 1. Project Goal

Build a full-stack truck trip planning application using:

- **Frontend:** React
- **Backend:** Django

The app will take a driver's trip details and produce:

- A route from **current location → pickup → dropoff**
- A legally compliant driving schedule based on FMCSA Hours of Service rules
- Required fuel, break, rest, and cycle restart stops
- A map showing the route and important stops
- Daily ELD-style log sheets for every calendar day of the trip

The assessment also requires:

- A live hosted version
- GitHub source code
- A 3–5 minute Loom walkthrough

---

# 2. Required User Inputs

The form must include these four required inputs:

1. **Current Location**
2. **Pickup Location**
3. **Dropoff Location**
4. **Current Cycle Used (Hours)**

Example:

```text
Current Location:
New York, NY

Pickup Location:
Chicago, IL

Dropoff Location:
Los Angeles, CA

Current Cycle Used:
18
```

## Input Validation

### Locations

All three location fields must:

- Be required
- Resolve to valid map coordinates
- Produce a routable location

Display friendly errors when a location cannot be found.

### Current Cycle Used

Rules:

```text
Minimum: 0
Maximum: 70
Numeric
Decimals allowed
```

Examples:

```text
0
12
18.5
69.75
70
```

Reject:

```text
-1
71
abc
empty
```

---

# 3. Optional but Recommended Inputs

## 3.1 Trip Start Date/Time

Add:

- **Trip Start Date**
- **Trip Start Time**

Recommended behavior:

```text
Default = current date/time
```

ELD logs are based on exact time and calendar days, so the scheduler needs a concrete starting timestamp.

The frontend must send the timestamp **with a UTC offset**, never as a naive string:

```text
2026-10-01T08:00:00-04:00
```

The backend converts it into the home terminal time zone (§5.19) before scheduling.

If you do not expose these fields in the UI, use:

```text
Trip starts now
```

as a documented assumption.

## 3.2 Log Details (Optional, Collapsible)

The assessment requires the daily log sheets to be "filled out". Add a collapsed **Log details** section to the form:

```text
Driver name
Co-driver name
Carrier name
Main office address
Truck / tractor number
Trailer number
Shipping document number
```

Every field is optional and prefilled with clearly marked demo values (§44). The user may override them.

---

# 4. Assessment Assumptions

The assessment explicitly defines these assumptions:

- Property-carrying driver
- 70-hour / 8-day cycle
- No adverse driving conditions
- Fueling at least once every 1,000 miles
- Pickup takes 1 hour
- Dropoff takes 1 hour

These assumptions should be treated as the fixed scope of the planner.

## Implementation Assumptions (not given by the assessment — document in README)

- Driver starts the trip with fresh 11-hour and 14-hour clocks (has had at least 10 consecutive hours off before trip start)
- Truck starts the trip with a full tank (`milesSinceFuel = 0`)
- Home terminal time zone = time zone of the current location
- The 24-hour log period starts at midnight, home terminal time
- Fuel stop = 30 minutes
- Pre-trip inspection = 15 minutes at the start of each duty period; post-trip inspection = 15 minutes at the end
- 10-hour daily rest is logged as Sleeper Berth
- Travel times come from a heavy-goods-vehicle (truck) routing profile
- All event boundaries fall on a 15-minute grid (§5.21)

---

# 5. Core FMCSA Rules to Implement

## 5.1 11-Hour Driving Limit

A property-carrying driver may drive a maximum of:

```text
11 hours
```

after the required rest period.

Track:

```text
dailyDrivingUsed
```

Initial value:

```text
0
```

Maximum:

```text
11 hours
```

When the driver reaches 11 driving hours:

```text
stop driving
→ schedule 10 consecutive hours off duty
→ reset daily driving allowance
```

---

# 5.2 14-Hour Driving Window

The driver may only drive within a:

```text
14 consecutive hour duty window
```

The clock begins when the driver starts **any work**, not when driving starts.

Example:

```text
08:00 Pickup starts
09:00 Pickup ends
09:00 Driving starts
```

The 14-hour clock started at:

```text
08:00
```

Therefore driving must stop by:

```text
22:00
```

even if the driver has not used all 11 driving hours.

Track:

```text
dutyWindowStart
```

Calculate:

```text
dutyWindowUsed = currentTime - dutyWindowStart
```

Maximum:

```text
14 hours
```

## Important: The 14-Hour Window Limits Driving, Not Work

After the 14th hour the driver may still perform on-duty, not-driving work. They just cannot drive a CMV.

Consequence for the scheduler:

```text
Window expires on arrival at dropoff
→ 1-hour dropoff happens immediately
→ post-trip inspection
→ trip ends
```

No 10-hour rest is forced before the dropoff.

The 14-hour check runs **only before driving segments**, never before pickup, dropoff, fuel, or inspection events.

---

# 5.3 11 Hours vs 14 Hours

These are different limits.

```text
11 hours = maximum actual driving time

14 hours = maximum elapsed duty window in which driving may occur
```

Example:

```text
08:00–09:00 Pickup
09:00–13:00 Driving
13:00–13:30 Break
13:30–18:00 Driving
18:00–18:30 Fuel
18:30–21:00 Driving
```

The scheduler must track both counters independently.

---

# 5.4 10-Hour Daily Reset

After:

```text
10 consecutive hours off duty
(Off Duty, Sleeper Berth, or a combination)
```

the driver receives a fresh:

```text
11-hour driving allowance
14-hour driving window
```

Recommended implementation:

```text
Use a simple 10-hour continuous rest, logged as Sleeper Berth
```

Do not implement split sleeper berth logic.

Example:

```text
20:45–21:00 Post-trip inspection
21:00–07:00 Sleeper Berth
07:00–07:15 Pre-trip inspection   ← new 14-hour window starts here
07:15       Driving resumes
```

After reset:

```text
dailyDrivingUsed = 0
drivingSinceBreak = 0
dutyWindowStart = null
```

The next duty event (the pre-trip inspection) starts a new 14-hour window.

---

# 5.5 Sleeper Berth

FMCSA supports split sleeper berth pairings such as:

```text
7 + 3
7 + 2
```

For this assessment:

- **Do** log the 10-hour daily rest as `SLEEPER_BERTH`. A long-haul log that never touches the Sleeper Berth row looks unrealistic to anyone who reads ELDs.
- **Do not** implement split sleeper pairing and recalculation logic.

Reason for skipping split sleeper:

- Significant added complexity (calculation periods, pair re-evaluation)
- Harder to test and explain
- Not requested by the assessment

Document the split-sleeper limitation in the README.

---

# 5.6 30-Minute Break

After:

```text
8 cumulative hours of driving
```

the driver needs:

```text
30 consecutive minutes without driving
```

The break can be:

- Off Duty
- Sleeper Berth
- On Duty — Not Driving

## The Rule That Matters: Any Qualifying Non-Driving Period Resets the Clock

The break does not have to be a dedicated `BREAK` event. Any **contiguous non-driving period of at least 30 minutes** satisfies it, including:

- Pickup (60 minutes on duty)
- Dropoff (60 minutes on duty)
- Fuel stop (30 minutes on duty)
- 10-hour rest / 34-hour restart
- Adjacent short events whose combined contiguous duration is at least 30 minutes (e.g., 15 min inspection + 15 min off duty)

Short, non-consecutive periods cannot be combined.

Track:

```text
drivingSinceBreak
contiguousNonDrivingMinutes
```

Logic:

```text
On every non-driving event:
    contiguousNonDrivingMinutes += event.duration
    if contiguousNonDrivingMinutes >= 30:
        drivingSinceBreak = 0

On every driving event:
    contiguousNonDrivingMinutes = 0
    drivingSinceBreak += event.duration
```

Only insert a dedicated `BREAK` event when `drivingSinceBreak` would exceed 8 hours and no qualifying non-driving period has occurred.

Example — pickup satisfies the break:

```text
07:00–07:15 Pre-trip inspection
07:15–12:15 Driving (5h)
12:15–13:15 Pickup               → drivingSinceBreak = 0
13:15       Next BREAK not due until 8 more driving hours
            (the 11-hour and 14-hour limits bind first here)
```

Without this rule the planner would insert an unnecessary break at hour 8 — an accuracy error a reviewer will catch.

---

# 5.7 What the 30-Minute Break Does Not Reset

The 30-minute break does **not** reset:

```text
dailyDrivingUsed
dutyWindowStart
cycleUsed
```

It only resets:

```text
drivingSinceBreak
```

It also does not extend the driver's 11-hour driving allowance or 14-hour window.

---

# 5.8 Pickup Rule

Pickup duration:

```text
1 hour
```

Duty status:

```text
ON_DUTY_NOT_DRIVING
```

Pickup contributes to:

```text
14-hour duty window (elapsed time keeps running)
70-hour cycle
```

Pickup does not contribute to:

```text
11-hour driving limit
drivingSinceBreak
```

Side effect:

```text
60 consecutive non-driving minutes → satisfies the 30-minute break → drivingSinceBreak = 0
```

Pickup is **not blocked** by an expired 14-hour window or an exhausted 70-hour cycle (on-duty work is allowed; only driving is restricted).

Flow:

```text
Arrive at pickup
→ 1 hour On Duty — Not Driving
→ drivingSinceBreak = 0
→ Continue trip (subject to the driving checks in §19)
```

---

# 5.9 Dropoff Rule

Dropoff duration:

```text
1 hour
```

Duty status:

```text
ON_DUTY_NOT_DRIVING
```

Dropoff contributes to:

```text
14-hour duty window
70-hour cycle
```

It does not count as driving time.

Dropoff is **not blocked** by an expired 14-hour window or an exhausted 70-hour cycle.

Flow:

```text
Arrive at dropoff
→ 1 hour On Duty — Not Driving
→ 15-minute post-trip inspection
→ Trip ends; remainder of the day is Off Duty
```

---

# 5.10 Fueling Rule

Fuel must occur at least once every:

```text
1,000 miles
```

Track:

```text
milesSinceFuel
```

Recommended scheduling threshold:

```text
900–950 miles
```

instead of waiting until exactly 1,000 miles.

This gives a safety margin.

Implementation:

```text
FUEL_TRIGGER_MILES = 950
```

Fuel is forced when `milesSinceFuel` reaches 950. It may also happen earlier when merged with a due break (§5.12).

---

# 5.11 Fuel Stop Duration

The assessment does not specify a fuel-stop duration.

Use this documented implementation assumption:

```text
Fuel stop = 30 minutes
```

Duty status:

```text
ON_DUTY_NOT_DRIVING
```

Fueling contributes to:

```text
14-hour duty window
70-hour cycle
```

---

# 5.12 Fuel Stop Can Satisfy the 30-Minute Break

Because a fuel stop is 30 consecutive non-driving minutes, it automatically satisfies the break under the general rule in §5.6. No special-case lookahead is needed.

To avoid two stops a few hours apart, use a simple merge rule:

```text
When the 8-hour break comes due:
    if milesSinceFuel >= FUEL_MERGE_THRESHOLD_MILES (600):
        insert FUEL (30 min) instead of BREAK
    else:
        insert BREAK (30 min)
```

Fuel stops are still forced by distance (§5.10). Whichever comes first resets `drivingSinceBreak`.

---

# 5.13 70-Hour / 8-Day Cycle

The assessment uses:

```text
70 hours / 8 days
```

The 70-hour limit is based on **on-duty time**, not only driving.

These count toward the cycle:

- Driving
- Pickup
- Dropoff
- Fueling
- Inspection
- Loading/unloading
- Other on-duty work

These do not count:

- Off Duty
- Sleeper Berth

Track:

```text
cycleUsed
```

Initialize:

```text
cycleUsed = currentCycleUsed input
```

Remaining:

```text
cycleRemaining = 70 - cycleUsed
```

Example:

```text
Current Cycle Used = 50

Remaining = 20 hours
```

## Important: The 70-Hour Limit Restricts Driving, Not Work

Per FMCSA, violations of the 60/7 or 70/8 rule occur only if the driver **drives** past the limit. On-duty, not-driving work remains allowed.

Therefore:

- The cycle check runs only before driving segments
- Pickup, dropoff, and inspections still happen when `cycleRemaining` is 0
- `cycleUsed` may exceed 70 from non-driving work; this is legal. Display `cycleRemaining` as `max(0, 70 - cycleUsed)`

---

# 5.14 Important Limitation — Missing Rolling 8-Day History

The real 70-hour/8-day rule is rolling.

Normally the system would need historical data such as:

```text
Day -7: 8h
Day -6: 10h
Day -5: 7h
Day -4: 11h
Day -3: 9h
Day -2: 6h
Day -1: 8h
Current Day: ...
```

But the assessment only provides:

```text
Current Cycle Used
```

It does **not** provide the previous 8 days individually.

Therefore the system cannot accurately know when old hours will drop out of the rolling window.

Do not invent missing history.

---

# 5.15 Conservative Cycle Strategy

Use:

```text
cycleRemaining = 70 - currentCycleUsed
```

Hours are never assumed to roll off during the trip, because the history needed to know when they would is not provided. Ignoring roll-off can only make the schedule more conservative, never illegal.

When cycle hours are exhausted **and the driver still needs to drive**:

```text
post-trip inspection
→ 34-hour restart
→ pre-trip inspection
→ resume driving
```

If the cycle runs out exactly on arrival at dropoff, **do not** insert a restart. The dropoff proceeds (§5.13).

If the input is already 70, the trip begins with the 34-hour restart, then the pre-trip inspection.

After the restart:

```text
cycleUsed = 0
cycleRemaining = 70
```

This provides a deterministic and compliant schedule without fabricating historical data.

Document this clearly.

---

# 5.16 34-Hour Restart

Represent the restart as:

```text
Event Type:
CYCLE_RESTART

Duty Status:
OFF_DUTY

Duration:
34 hours
```

After completion:

```text
cycleUsed = 0
dailyDrivingUsed = 0
drivingSinceBreak = 0
dutyWindowStart = null
```

A new 14-hour window begins when the driver resumes work.

---

# 5.17 Rules Not Required

Do not implement these initially:

- Adverse driving conditions exception
- CDL short-haul exception
- Non-CDL short-haul exception
- 16-hour short-haul exception
- Personal conveyance
- Yard moves
- Split sleeper berth optimization

These are outside the assessment's core scope.

---

# 5.18 Pre-Trip and Post-Trip Inspections

The assessment does not specify inspections, but the FMCSA guide's sample log includes pre-trip work and a post-trip inspection, and real logs never jump straight from Off Duty to Driving.

Documented assumption:

```text
PRE_TRIP_INSPECTION
    15 minutes, ON_DUTY_NOT_DRIVING
    at the start of every duty period
    (trip start, after every 10-hour rest, after every 34-hour restart)

POST_TRIP_INSPECTION
    15 minutes, ON_DUTY_NOT_DRIVING
    at the end of every duty period
    (before every 10-hour rest / 34-hour restart, and after dropoff)
```

Rules:

- Both count toward the 70-hour cycle
- The pre-trip inspection starts the 14-hour window
- The post-trip inspection may occur after the 14th hour (it is non-driving work)

Keep both durations in constants so the assumption can be changed or disabled in one place.

---

# 5.19 Home Terminal Time Zone

FMCSA requires logs to use the time zone of the driver's **home terminal**, even when the truck crosses time zones. All drivers at a terminal use the same 24-hour period start.

Assumption:

```text
Home terminal = current location
```

Implementation:

- Resolve the IANA time zone from the current location's coordinates (`timezonefinder` library)
- Convert `start_datetime` into that zone
- Use timezone-aware datetimes everywhere in the scheduler; never naive datetimes
- Split days at midnight in the home terminal zone
- Print the zone on every log sheet header (e.g., `All times: America/New_York`)
- Map popups and the timeline may additionally show local time at the stop, clearly labeled

Example:

```text
New York → Chicago → Los Angeles
All log entries stay in Eastern Time, even while the truck is in Pacific Time.
```

Edge case: on a DST transition day the calendar day is 23 or 25 hours long. Either list this as a known limitation or compute day boundaries in wall-clock time. Do not let the 24-hour assertion (§37) crash on it.

---

# 5.20 Starting Clock State

The input provides only `Current Cycle Used`. Assume:

```text
dailyDrivingUsed = 0
drivingSinceBreak = 0
dutyWindowStart = null      (starts with the first pre-trip inspection)
milesSinceFuel = 0
cycleUsed = currentCycleUsed input
```

This means the driver is coming off at least 10 consecutive hours off duty. The Day 1 log shows `00:00 → trip start` as Off Duty, which is consistent with this assumption.

---

# 5.21 Quarter-Hour Time Grid

Paper logs use 15-minute increments, and the guide's sample totals are quarter hours (1.75, 7.75, 4.5). Keep the whole timeline on a 15-minute grid:

- Round the trip start time **up** to the next 15-minute mark
- All fixed durations are already multiples of 15 (inspections 15, fuel/break 30, pickup/dropoff 60, rest 600, restart 2040)
- HOS limits are whole or half hours, so segments cut by a limit stay on the grid
- When a driving segment ends at a waypoint, round its duration **up** to the next 15 minutes (conservative: logs slightly more driving, never less)
- When a segment is cut by the fuel distance trigger, round the duration **down** so the 1,000-mile margin is never exceeded

Apply the HOS checks to the rounded values. Position interpolation (§25) may still use unrounded times.

Result: every log total is an exact quarter hour and the four rows always sum to exactly 24.

---

# 6. Route Flow

The route must always be:

```text
Current Location
        ↓
Pickup Location
        ↓
Dropoff Location
```

Do not calculate only:

```text
Current → Dropoff
```

The pickup stop is mandatory.

---

# 7. Map / Routing Provider

Use **OpenRouteService (ORS)** as the single provider. One free API key covers:

- Geocoding — `/geocode/search`
- Autocomplete — `/geocode/autocomplete`
- Reverse geocoding — `/geocode/reverse`
- Truck routing — `/v2/directions/driving-hgv` (geometry, distance, duration, per-step instructions)

Map display: **react-leaflet** with OpenStreetMap or CARTO tiles (free, no key).

Do not use:

- **Public Nominatim for autocomplete** — its usage policy forbids as-you-type requests (max 1 request/second)
- **OSRM demo server** — car profile only, not intended for production traffic

Verify on day one:

- Free-tier daily and per-minute quotas cover your testing plus reviewer traffic
- The free-tier maximum route distance accepts your longest demo trip (e.g., New York → Chicago → Los Angeles). If not, route each leg (current → pickup, pickup → dropoff) as a separate request and concatenate.

All provider calls go through the Django backend so the API key never reaches the browser. That includes autocomplete: proxy it as `GET /api/geocode/autocomplete?q=`.

Routing flow:

```text
Current Location
        ↓ geocode (or use coordinates from autocomplete)
Pickup Location
        ↓ geocode
Dropoff Location
        ↓ geocode
ORS driving-hgv
        ↓
Current → Pickup → Dropoff
(geometry + per-leg + per-step distance/duration)
```

---

# 8. Route Duration

Use the provider's **truck (HGV) duration**, not car duration.

Car profiles understate truck drive time, which shifts every downstream rest, fuel stop, and log entry.

If the chosen provider has no truck profile, apply a documented truck-speed factor (e.g., car duration × 1.15) and state it in the README.

Avoid using only:

```text
distance / single average speed
```

because actual road speeds vary.

Use:

```text
HGV route duration (per leg, per step)
```

as the raw driving duration before HOS constraints are applied.

---

# 9. Recommended Architecture

```text
React Frontend
      ↓
Django REST API
      ↓
Routing Service
      ↓
HOS Scheduling Engine
      ↓
Canonical Trip Event Timeline
      ↓
 ┌─────────────────────────────┐
 │ Map                         │
 │ Route Timeline              │
 │ Trip Summary                │
 │ ELD Generator               │
 │ Daily Logs                  │
 └─────────────────────────────┘
```

---

# 10. Most Important Architecture Decision

Use **one canonical trip event timeline**.

Do not separately calculate:

- Map stops
- ELD entries
- Timeline items
- Summary totals

Correct design:

```text
HOS Planner
     ↓
events[]
     ↓
 ┌──────────────┬──────────────┬──────────────┬──────────────┐
 │ Map          │ Timeline     │ ELD          │ Summary      │
 └──────────────┴──────────────┴──────────────┴──────────────┘
```

This prevents mismatches between views.

---

# 11. Trip Event Data Model

Every activity in the trip should become a `TripEvent`.

Example:

```json
{
  "type": "DRIVING",
  "duty_status": "DRIVING",
  "start_time": "2026-10-01T08:00:00",
  "end_time": "2026-10-01T12:30:00",
  "duration_minutes": 270,
  "start_location": "New York, NY",
  "end_location": "Pittsburgh, PA",
  "distance_miles": 370,
  "reason": "route"
}
```

---

# 12. Event Types

Event types:

```text
PRE_TRIP_INSPECTION
DRIVING
PICKUP
DROPOFF
FUEL
BREAK
POST_TRIP_INSPECTION
DAILY_REST
CYCLE_RESTART
```

Inspection durations are documented assumptions (§5.18).

---

# 13. Duty Status Enum

Use exactly four internal statuses:

```text
OFF_DUTY
SLEEPER_BERTH
DRIVING
ON_DUTY_NOT_DRIVING
```

These map directly to the ELD graph rows.

---

# 14. Event-to-Duty Mapping

```text
PRE_TRIP_INSPECTION  → ON_DUTY_NOT_DRIVING
DRIVING              → DRIVING
PICKUP               → ON_DUTY_NOT_DRIVING
DROPOFF              → ON_DUTY_NOT_DRIVING
FUEL                 → ON_DUTY_NOT_DRIVING
BREAK                → OFF_DUTY
POST_TRIP_INSPECTION → ON_DUTY_NOT_DRIVING
DAILY_REST           → SLEEPER_BERTH
CYCLE_RESTART        → OFF_DUTY
```

Result: all four ELD rows are used on a typical multi-day trip.

---

# 15. Scheduler State

Maintain a state object containing:

```text
currentTime              (timezone-aware, home terminal zone)
homeTimezone
currentPosition
currentLegIndex
elapsedDrivingOnLeg
remainingLegDistance
remainingLegDuration
dailyDrivingUsed
drivingSinceBreak
contiguousNonDrivingMinutes
dutyWindowStart
cycleUsed
milesSinceFuel
cumulativeMiles
totalDrivingMinutes
events[]
```

The current date is derived from `currentTime`; do not track it separately.

---

# 16. Main Scheduling Question

Before every new driving segment, calculate:

```text
How long can the driver legally drive right now?
```

The answer is constrained by:

```text
remaining route duration
remaining 11-hour driving allowance
remaining 14-hour duty window
time until 30-minute break is required
remaining 70-hour cycle availability
distance until fuel is required
next route waypoint
```

---

# 17. Core Drive Duration Calculation

Conceptually:

```text
allowedDriveMinutes =
min(
    remainingLegDuration,
    11h - dailyDrivingUsed,
    (dutyWindowStart + 14h) - currentTime,
    8h - drivingSinceBreak,
    70h - cycleUsed,
    timeToTravel(FUEL_TRIGGER_MILES - milesSinceFuel)
)
```

Then apply the quarter-hour rounding rules (§5.21).

If `allowedDriveMinutes <= 0`, resolve the binding constraint and recompute:

```text
Binding constraint     → Action
remainingLegDuration   → arrive at waypoint (pickup / dropoff)
8h break               → BREAK, or merged FUEL (§5.12)
fuel distance          → FUEL
11h or 14h             → POST_TRIP → DAILY_REST (10h, Sleeper Berth) → PRE_TRIP
70h cycle              → POST_TRIP → CYCLE_RESTART (34h) → PRE_TRIP
```

If the 11h/14h limit and the 70h cycle bind together, the 34-hour restart wins (it also covers the 10-hour rest).

---

# 18. Scheduler Flow

Overall:

```text
Initialize scheduler state

Travel current location → pickup

Perform pickup

Travel pickup → dropoff

Perform dropoff

Finish trip
```

Each travel leg uses the HOS scheduling engine.

---

# 19. Before Every Driving Segment

These checks run **only before driving**. Pickup, dropoff, fuel, and inspections are never blocked by the 14-hour window or the 70-hour cycle.

Check:

```text
1. Is cycle time available?        No → post-trip + 34h restart + pre-trip
2. Is 14-hour window time left?    No → post-trip + 10h rest + pre-trip
3. Is daily driving time left?     No → post-trip + 10h rest + pre-trip
4. Is a 30-minute break required?  Yes → BREAK or merged FUEL
5. Is fuel required?               Yes → FUEL
6. Is there remaining route?       No → arrive at waypoint
```

Then calculate the maximum allowed next drive segment (§17).

---

# 20. Pickup Logic

When reaching pickup:

```text
Create PICKUP event
Duration = 60 minutes
Duty Status = ON_DUTY_NOT_DRIVING
```

Update:

```text
cycleUsed += 1 hour
contiguousNonDrivingMinutes += 60 → drivingSinceBreak = 0
```

The 14-hour duty window continues running.

Pickup proceeds even if the 14-hour window or the 70-hour cycle is exhausted. The next driving check then inserts the rest or restart.

---

# 21. Dropoff Logic

When reaching dropoff:

```text
Create DROPOFF event
Duration = 60 minutes
Duty Status = ON_DUTY_NOT_DRIVING

Create POST_TRIP_INSPECTION event
Duration = 15 minutes
Duty Status = ON_DUTY_NOT_DRIVING
```

Update:

```text
cycleUsed += 1.25 hours
```

Dropoff proceeds even if the 14-hour window or the 70-hour cycle is exhausted.

The trip finishes after the post-trip inspection. The rest of that calendar day is Off Duty.

---

# 22. Daily Rest Trigger

Insert a daily rest only when **another driving segment is needed** and:

```text
dailyDrivingUsed reaches 11 hours
```

or:

```text
the 14-hour duty window prevents further driving
```

Never insert it when the only remaining work is non-driving (dropoff, post-trip).

Sequence:

```text
POST_TRIP_INSPECTION   15 min   ON_DUTY_NOT_DRIVING
DAILY_REST             10 h     SLEEPER_BERTH
PRE_TRIP_INSPECTION    15 min   ON_DUTY_NOT_DRIVING  ← starts new 14-hour window
```

Reset after the rest:

```text
dailyDrivingUsed = 0
drivingSinceBreak = 0
dutyWindowStart = null
```

When work resumes:

```text
dutyWindowStart = start of PRE_TRIP_INSPECTION
```

If the cycle is also exhausted, insert `CYCLE_RESTART` instead.

---

# 23. Break Trigger

When:

```text
drivingSinceBreak would exceed 8 hours
and no qualifying ≥ 30-minute non-driving period has occurred
```

insert:

```text
BREAK
Duration = 30 minutes
Duty Status = OFF_DUTY
```

or a `FUEL` stop instead if the merge rule applies (§5.12).

Pickup, dropoff, fuel stops, and rests already reset `drivingSinceBreak` (§5.6), so no extra break is inserted after them.

---

# 24. Fuel Trigger

Track:

```text
milesSinceFuel
```

Force a fuel stop when:

```text
milesSinceFuel reaches FUEL_TRIGGER_MILES (950)
```

Fuel early when a break is due and `milesSinceFuel >= FUEL_MERGE_THRESHOLD_MILES (600)` (§5.12).

Insert:

```text
FUEL
Duration = 30 minutes
Duty Status = ON_DUTY_NOT_DRIVING
```

Then:

```text
milesSinceFuel = 0
drivingSinceBreak = 0     (30 consecutive non-driving minutes)
cycleUsed += 0.5
```

---

# 25. Route Position Interpolation

This is important.

Suppose the HOS engine decides:

```text
Driver must stop after 6h 25m of driving on this leg
```

The system needs to know where that point occurs on the route.

Map **elapsed driving time → distance → coordinate** using the provider's per-step data, not a single average speed:

```text
1. ORS returns steps, each with distance, duration, and way_points [startIdx, endIdx]
   into the route geometry.
2. Walk the steps, accumulating duration, until the target elapsed time falls inside a step.
3. Inside that step, interpolate linearly by time fraction → distance within the step.
4. Walk that step's polyline slice to the distance (haversine) → latitude/longitude.
5. Reverse geocode → "City, ST".
```

Why: on legs mixing highway and city driving, a single average speed places markers tens of miles from where the truck actually is at that time.

Also store cumulative miles at every stop. These are needed for daily miles on each log sheet and for `milesSinceFuel`.

Performance and resilience:

- Reverse geocode each stop once; cache by rounded coordinates
- Run reverse geocodes concurrently (thread pool); coast-to-coast trips have 15+ stops
- If a reverse geocode fails, fall back to the nearest known place or coordinates rather than failing the whole request

This location powers:

- Map marker
- Timeline text
- ELD remarks

---

# 26. Fuel Stop Placement

Preferred approach:

```text
Find an actual gas station/service area near the route
```

if the chosen map API supports POI search.

Simpler assessment-safe approach:

```text
Use a route point around 900–950 miles
```

and reverse geocode that point.

Do not let POI search become a blocker.

---

# 27. Backend API

Recommended endpoints:

```text
POST /api/trips/plan
GET  /api/geocode/autocomplete?q=
GET  /api/health
```

Request example:

```json
{
  "current_location": { "label": "New York, NY", "lat": 40.7128, "lng": -74.0060 },
  "pickup_location":  { "label": "Chicago, IL" },
  "dropoff_location": { "label": "Los Angeles, CA" },
  "current_cycle_used": 18,
  "start_datetime": "2026-10-01T08:00:00-04:00",
  "log_details": {
    "driver_name": "Demo Driver",
    "co_driver_name": "",
    "carrier_name": "Demo Carrier LLC",
    "main_office_address": "Demo City, ST",
    "truck_number": "TRUCK-001",
    "trailer_number": "TRL-001",
    "shipping_document": "DEMO-0001"
  }
}
```

Coordinates are optional. When present (selected from autocomplete), the backend skips geocoding for that location.

---

# 28. API Response Structure

Example:

```json
{
  "trip": {
    "distance_miles": 2420,
    "driving_hours": 38.4,
    "elapsed_hours": 63.5,
    "days": 3,
    "fuel_stops": 2,
    "rest_stops": 3
  },
  "route": {
    "geometry": "...",
    "current_location": {},
    "pickup_location": {},
    "dropoff_location": {}
  },
  "events": [],
  "daily_logs": []
}
```

---

# 29. Backend Errors

Return structured, human-readable errors for:

```text
Invalid current location
Pickup location could not be geocoded
Dropoff location could not be geocoded
Current cycle must be between 0 and 70
Routing service unavailable
No route found
Invalid start date/time
```

Do not expose raw stack traces to the frontend.

---

# 30. Backend Project Structure

Recommended:

```text
backend/
│
├── manage.py
│
├── config/
│
├── trips/
│   ├── views.py
│   ├── serializers.py
│   ├── urls.py
│   └── tests/
│
├── services/
│   ├── routing_service.py
│   ├── geocoding_service.py
│   ├── hos_scheduler.py
│   ├── eld_service.py
│   └── route_position.py
│
└── common/
    ├── enums.py
    └── constants.py
```

---

# 31. Constants

Keep all regulatory and assessment constants in one place.

Example:

```python
MAX_DRIVING_HOURS = 11
MAX_DUTY_WINDOW_HOURS = 14
REQUIRED_REST_HOURS = 10
BREAK_AFTER_DRIVING_HOURS = 8
BREAK_DURATION_MINUTES = 30
MAX_CYCLE_HOURS = 70
CYCLE_DAYS = 8
CYCLE_RESTART_HOURS = 34
MAX_MILES_BETWEEN_FUEL = 1000
FUEL_TRIGGER_MILES = 950
FUEL_MERGE_THRESHOLD_MILES = 600
PICKUP_DURATION_MINUTES = 60
DROPOFF_DURATION_MINUTES = 60
FUEL_DURATION_MINUTES = 30
PRE_TRIP_INSPECTION_MINUTES = 15
POST_TRIP_INSPECTION_MINUTES = 15
TIME_GRID_MINUTES = 15
DAILY_REST_STATUS = "SLEEPER_BERTH"
ROUTING_PROFILE = "driving-hgv"
```

Avoid magic numbers inside business logic.

---

# 32. Service Separation

Use separate services:

```text
RoutingService
HOSPlanner
ELDGenerator
RoutePositionService
```

Responsibilities:

## RoutingService

- Geocode addresses
- Request road routes
- Return route distance, duration, and geometry

## HOSPlanner

- Apply all Hours of Service rules
- Generate canonical `TripEvent[]`

## ELDGenerator

- Split events by date
- Generate daily duty segments
- Calculate totals
- Generate remarks

## RoutePositionService

- Find coordinates for intermediate stop points
- Reverse geocode route stop locations

---

# 33. HOS Planner Output

The HOS planner should return:

```text
events[]
```

It should not:

- Render UI
- Draw maps
- Draw ELD graphics
- Manipulate React state

Keep the scheduling engine framework-agnostic.

---

# 34. ELD Generator

Input:

```text
events[]
```

Output:

```text
dailyLogs[]
```

Each daily log should contain:

```text
date
distance
duty segments
remarks
status totals
```

---

# 35. Split Events at Midnight

If an event crosses midnight:

```text
Oct 1 22:00 → Oct 2 02:00
```

split it:

```text
Oct 1:
22:00 → 24:00

Oct 2:
00:00 → 02:00
```

Each calendar day receives a separate ELD sheet.

Midnight means midnight in the **home terminal time zone** (§5.19), not the local time where the truck happens to be.

---

# 36. Fill Unused Daily Time

If trip starts at:

```text
08:00
```

then before that:

```text
00:00–08:00 = OFF_DUTY
```

If the driver's final event ends at:

```text
19:00
```

then:

```text
19:00–24:00 = OFF_DUTY
```

Every daily log should cover a complete 24-hour period.

The `00:00 → trip start` Off Duty block on Day 1 is consistent with the starting clock assumption (§5.20).

---

# 37. Daily ELD Total Validation

Every log must satisfy:

```text
OFF_DUTY
+
SLEEPER_BERTH
+
DRIVING
+
ON_DUTY_NOT_DRIVING
=
24 hours
```

Add an automated validation/assertion for this.

---

# 38. ELD Graph Rows

Render four horizontal rows:

```text
Off Duty

Sleeper Berth

Driving

On Duty (Not Driving)
```

---

# 39. ELD Rendering Technology

Use:

```text
SVG
```

Advantages:

- Easy coordinate calculations
- Sharp at any resolution
- Responsive
- Simple horizontal/vertical lines
- Easy hour markers
- Easy printing/export later

---

# 40. ELD X Coordinate Formula

If graph width is:

```text
960px
```

then:

```text
960 / 24 = 40px per hour
```

General formula:

```text
x = minutesSinceMidnight / 1440 * graphWidth
```

Example:

```text
08:00 = 480 minutes

480 / 1440 = 0.3333
```

So 08:00 appears one-third across the graph.

Draw tick marks every 15 minutes, matching the FMCSA grid: full-height lines at each hour, a taller tick at the half hour, and short ticks at the quarter hours.

---

# 41. Duty Status Y Coordinates

Example:

```text
OFF_DUTY            y = 20
SLEEPER_BERTH       y = 50
DRIVING             y = 80
ON_DUTY_NOT_DRIVING y = 110
```

For each segment:

```text
draw horizontal line
from xStart to xEnd
at corresponding Y
```

When status changes:

```text
draw vertical line
from previous Y to new Y
```

---

# 42. ELD Remarks

At every duty status change, record the city/town and state abbreviation (an FMCSA requirement). If the stop is not in a city, use the best available description, e.g., `I-80 near Des Moines, IA`.

Render remarks like the FMCSA sample log (guide pp. 18–19):

- A small bracket under the grid spanning each non-driving stop (start x → end x)
- The location label rotated about 45°, hanging from the bracket
- Stagger or truncate labels when stops are close together so they don't overlap

Also show a readable list under the sheet:

```text
07:00 New York, NY — Pre-trip inspection
07:15 New York, NY — Driving
12:15 Clearfield, PA — 30-minute break
12:45 Clearfield, PA — Driving
18:00 Toledo, OH — Fuel
```

These remarks come from the same `TripEvent` data used by the map.

---

# 43. Full Log Sheet Layout

Render the complete **Driver's Daily Log**, not just the graph. The assessment says "draw on the log and fill out the sheet". Copy the FMCSA paper layout (guide p. 15 for the blank form, p. 19 for a completed one).

Header:

```text
Date (month / day / year)
Total miles driving today
Vehicle numbers (truck, trailer)
From / To (first and last location of the day)
Name of carrier
Main office address
Driver certification line ("I certify that these entries are true and correct" + driver name)
Name of co-driver
Time zone (home terminal)
```

Grid:

```text
Hour labels: Midnight, 1 … 11, Noon, 13 … 23, Midnight
Four rows: Off Duty, Sleeper Berth, Driving, On Duty (Not Driving)
15-minute tick marks (§40)
One continuous status line with vertical transitions
```

Right column:

```text
Total hours per row in quarter-hour format (10, 1.75, 7.75, 4.5)
"= 24" check
```

Bottom:

```text
Remarks area with brackets and rotated locations (§42)
Shipping document number (or shipper name and commodity)
```

Because of the quarter-hour grid (§5.21), every row total is an exact quarter hour and the totals always sum to 24.

---

# 44. Log Sheet Metadata

The assessment does not provide:

```text
Driver name
Carrier name
Carrier address
Truck number
Trailer number
Shipping document number
Co-driver
```

But it requires the sheets to be filled out, so do not leave these blank.

Approach: optional form inputs (§3.2), prefilled with clearly marked demo values:

```text
Driver:          Demo Driver
Co-driver:       (none)
Carrier:         Demo Carrier LLC
Main office:     Demo City, ST
Truck / Trailer: TRUCK-001 / TRL-001
Shipping doc:    DEMO-0001
```

Show a small "demo values" note on the sheet whenever defaults are used, so nobody thinks they were inferred. Document this in the README.

---

# 45. Result Page Layout

Recommended desktop layout:

```text
┌─────────────────────────────────────────────┐
│ Trip Summary Cards                          │
├──────────────────────┬──────────────────────┤
│                      │                      │
│ Interactive Map      │ Route Timeline       │
│                      │                      │
├──────────────────────┴──────────────────────┤
│ Daily ELD Logs                              │
│ [Day 1] [Day 2] [Day 3]                    │
│                                             │
│ ELD Graph                                   │
└─────────────────────────────────────────────┘
```

---

# 46. Map Markers

Show different markers for:

```text
Current Location
Pickup
Dropoff
Fuel
30-minute Break
10-hour Rest
34-hour Restart
```

Use both:

- Color
- Icon

Do not rely only on color.

---

# 47. Map Popup Details

Example:

```text
Fuel Stop

Location:
Des Moines, IA

Arrival:
Oct 2, 3:40 PM

Duration:
30 minutes

Duty Status:
On Duty — Not Driving
```

---

# 48. Route Timeline

Example:

```text
08:00 — Start Driving
12:45 — Pickup
13:45 — Resume Driving
18:15 — 30-Minute Break
18:45 — Resume Driving
21:30 — 10-Hour Rest
```

The timeline should be generated from `TripEvent[]`.

---

# 49. Trip Summary Cards

Recommended summary fields:

```text
Total Distance
Raw Driving Time
Total Trip Time
Estimated Arrival
Fuel Stops
Breaks
Daily Rests
Cycle Used
Cycle Remaining
```

Example:

```text
Distance: 2,420 mi
Driving: 38h 24m
Trip Time: 63h 30m
Fuel Stops: 2
Daily Rests: 3
Cycle Remaining: 21h
```

---

# 50. ELD Day Navigation

For multi-day trips:

```text
Day 1
Day 2
Day 3
Day 4
```

Each day should show:

- Date
- Total miles
- Duty graph
- Remarks
- Duty status totals

## Print / Export

- Print stylesheet: one log sheet per page, app chrome hidden
- "Print all logs" button; `window.print()` with the print stylesheet gives users PDF output for free
- Optional per-day SVG/PNG download
- Optional "show all days" stacked view in addition to the tabs

---

# 51. Responsive UI

Test at minimum:

```text
Desktop
Tablet
Mobile
```

Prioritize desktop because assessment reviewers will most likely evaluate there.

---

# 52. Loading States

Show a polished progress state while calculating.

Example:

```text
Planning compliant trip...
```

Optional stages:

```text
Finding route
Calculating HOS schedule
Generating ELD logs
```

## Backend Cold Start

Free hosting tiers that sleep idle services can make the first request take 30–60 seconds. A reviewer who sees a dead-looking app may give up.

Mitigations, in order of preference:

1. Use an always-on backend instance
2. Fire `GET /api/health` on page load to wake the server while the user fills the form
3. If a request takes longer than about 5 seconds, show: "Waking up the server — the first request can take up to a minute"

---

# 53. Empty State

Before the user plans a trip:

```text
Enter trip information to generate a compliant route and ELD schedule.
```

Avoid leaving large blank components without explanation.

## Sample Trip Buttons

Show quick-fill presets above the form:

```text
Short trip      — single day, no rest required
Long haul       — e.g., Boston, MA → Chicago, IL → Los Angeles, CA, cycle 15
                  (multi-day, fuel stops, 10-hour rests)
Near cycle limit — cycle 65 (triggers a 34-hour restart)
```

Reviewers will use these. They also guarantee a working demo for the Loom.

---

# 54. Error State

Example:

```text
We couldn't find a route between these locations.

Check the addresses and try again.
```

Do not show raw backend error JSON to the user.

---

# 55. Location Autocomplete

Recommended enhancement:

As user types:

```text
Los Ang...
```

show:

```text
Los Angeles, CA
Los Angeles County, CA
```

Implementation:

- ORS `/geocode/autocomplete`, proxied through Django (§7)
- Debounce about 300 ms; minimum 3 characters
- Bias results to the US
- Keep the selected suggestion's coordinates and send them with the plan request, so the backend skips re-geocoding
- Do not use public Nominatim for this (usage policy)

This reduces invalid routing requests.

---

# 56. Frontend Structure

Suggested:

```text
src/
│
├── components/
│   ├── TripForm/
│   ├── Map/
│   ├── RouteTimeline/
│   ├── TripSummary/
│   ├── EldLog/
│   ├── EldGraph/
│   └── StatusBadge/
│
├── pages/
│   └── TripPlanner/
│
├── services/
│   └── api.ts
│
├── hooks/
│
├── types/
│
└── utils/
```

Tooling:

- **Vite** with React + TypeScript (Create React App is deprecated)
- **react-leaflet** + leaflet for the map
- Hand-written SVG for the log sheet; no chart library needed

---

# 57. Frontend State

You likely need only:

```text
formData
loading
error
tripResult
```

Avoid Redux unless the app genuinely needs it.

---

# 58. Database

The assessment does not explicitly require trip persistence.

Simplest design:

```text
Request
↓
Calculate
↓
Return result
```

No database is necessary.

Optional persistence can be added later.

---

# 59. Backend Testing Strategy

The most important test target is:

```text
HOS scheduler
```

Accuracy is the core technical requirement.

---

# 60. Test Cases

## Test 1 — Short Trip

Input:

```text
5 hours driving
Cycle used = 0
```

Expected:

```text
No mandatory 30-minute break
No daily rest
No fuel stop
```

---

## Test 2 — Eight-Hour Break Threshold

Input (planner called directly on a single driving leg with no intermediate stops):

```text
10 hours driving, milesSinceFuel low enough that no fuel merge applies
```

Expected:

```text
8h driving
30m break
2h driving
```

If a pickup, fuel stop, or other 30+ minute non-driving period occurs before hour 8, no BREAK is inserted (see Test 18).

---

## Test 3 — Eleven-Hour Driving Limit

Input:

```text
15 hours raw driving
```

Expected:

```text
Maximum 11h driving
10h rest
Remaining driving
```

while still respecting the 14-hour window.

---

## Test 4 — 14-Hour Window

Create a case containing:

```text
1h pickup
several non-driving events
driving
```

Verify that no additional driving occurs after the 14-hour window expires.

---

## Test 5 — Pickup

Verify:

```text
Duration = 1h
Status = ON_DUTY_NOT_DRIVING
Cycle used increases by 1h
```

---

## Test 6 — Dropoff

Verify the same rules as pickup.

---

## Test 7 — Fuel

Example:

```text
1,500-mile trip
```

Expected:

```text
At least one fuel stop before 1,000 miles
```

---

## Test 8 — Long Fuel Route

Example:

```text
2,600 miles
```

Expected:

```text
At least two fuel stops
```

depending on placement strategy.

---

## Test 9 — Cycle Near Limit

Input:

```text
Current cycle used = 68h
```

Trip begins with:

```text
1h pickup
2h driving
```

Verify the scheduler does not illegally continue past cycle availability.

---

## Test 10 — 34-Hour Restart

Input:

```text
Current cycle used = 70h
```

Expected:

```text
34h restart
→ pre-trip inspection
→ driving
```

The restart comes before the first pre-trip inspection.

---

## Test 11 — Midnight Crossing

Event:

```text
23:00 → 03:00
```

Expected:

```text
Day 1:
23:00 → 24:00

Day 2:
00:00 → 03:00
```

---

## Test 12 — Daily Log Totals

For every generated day:

```text
sum(all status durations) == 24 hours
```

---

## Test 13 — ELD Coordinates

Example:

```text
06:00–12:00 Driving
```

Expected:

```text
start = 25% of graph width
end = 50% of graph width
```

---

## Test 14 — Fuel + Break Overlap

If fuel is required at the same time the 30-minute break becomes due:

```text
Create one 30-minute fuel stop
```

Do not create:

```text
30-minute break
+
30-minute fuel stop
```

---

## Test 15 — Invalid Cycle Hours

Reject:

```text
-5
72
abc
```

---

## Test 16 — Invalid Locations

Reject or gracefully handle:

```text
empty locations
unresolvable locations
```

---

## Test 17 — Routing API Failure

Simulate:

```text
timeout
503
invalid provider response
```

Return a controlled application error.

## Test 18 — Pickup Satisfies the Break

Input:

```text
5h driving → pickup (1h) → long remaining leg
```

Expected:

```text
No BREAK event between pickup and the next 8 hours of driving
(the 11h / 14h limits bind first)
```

---

## Test 19 — Dropoff After the 14-Hour Window

Input:

```text
Arrival at dropoff exactly when the 14-hour window expires
```

Expected:

```text
DROPOFF immediately → POST_TRIP → trip ends
No DAILY_REST before the dropoff
```

---

## Test 20 — Dropoff With Cycle Exhausted

Input:

```text
cycleRemaining = 0 on arrival at dropoff
```

Expected:

```text
DROPOFF → POST_TRIP → trip ends
No CYCLE_RESTART
```

---

## Test 21 — Home Terminal Time Zone

Input:

```text
New York, NY → Chicago, IL → Los Angeles, CA
```

Expected:

```text
All event times in America/New_York
Days split at Eastern midnight
Log header shows the time zone
```

---

## Test 22 — Quarter-Hour Grid

For every generated trip:

```text
Every event start/end is a multiple of 15 minutes
Every row total is a multiple of 0.25 hours
Rows sum to exactly 24 per day
```

---

## Test 23 — Inspections

Expected:

```text
Every duty period starts with PRE_TRIP_INSPECTION (starts the 14-hour window)
Every duty period ends with POST_TRIP_INSPECTION
Post-trip after the 14th hour is allowed
```

---

## Test 24 — Sleeper Berth Rest

Expected:

```text
Every DAILY_REST appears on the SLEEPER_BERTH row
```

---

## Test 25 — Current Location Equals Pickup

Input:

```text
Current location = pickup location
```

Expected:

```text
No routing error
PRE_TRIP → PICKUP → driving to dropoff
```

---

## Test 26 — Time-Based Position Interpolation

Input:

```text
Synthetic route: step A 100 mi in 1.5h (fast), step B 20 mi in 1h (slow)
Stop at 2h elapsed driving
```

Expected:

```text
Stop lies inside step B, about 10 mi in (not at the 2/2.5 distance point)
```

---

## Test 27 — Fuel Merge at Break

Input:

```text
Break due at 8h, milesSinceFuel = 620
```

Expected:

```text
One FUEL event (30 min)
No separate BREAK event
milesSinceFuel = 0, drivingSinceBreak = 0
```

---

# 61. README Requirements

README should contain:

```text
Project purpose
Screenshots
Architecture
Setup instructions
Frontend setup
Backend setup
Environment variables
Routing API setup
HOS rules implemented
Assumptions
Limitations
Test commands
Deployment
Live URL
Loom URL
```

---

# 62. README Assumptions Section

Document all assumptions:

```text
Property-carrying driver
70-hour/8-day cycle
No adverse conditions
Driver starts with fresh 11-hour and 14-hour clocks
Truck starts with a full tank
10-hour continuous daily rest, logged as Sleeper Berth
No split sleeper optimization
Any 30+ minute non-driving period satisfies the 30-minute break
Fuel interval <= 1,000 miles (forced at 950; merged with breaks after 600)
Fuel duration assumed to be 30 minutes
Pickup duration = 1 hour
Dropoff duration = 1 hour
Pre-trip and post-trip inspections = 15 minutes each
Home terminal time zone = current location's time zone
Log day starts at midnight, home terminal time
All times on a 15-minute grid; drive times rounded up
Truck (HGV) routing durations
Trip start defaults to current time unless explicitly provided
Rolling 8-day history is unavailable; no hours roll off during the trip
34-hour restart is used when the cycle is exhausted and more driving is needed
Missing carrier/driver fields use clearly marked demo values
```

---

# 63. README Limitations

Explicitly mention:

```text
No split sleeper berth optimization
No adverse-driving exception
No short-haul exceptions
No personal conveyance support
No yard move support
No actual ELD device integration
No historical 8-day duty record input
```

Also mention:

```text
DST transition days (23/25-hour calendar days)
Hours never roll off during the trip (conservative cycle handling)
Fuel stops placed on the route, not at actual fuel stations
```

---

# 64. Environment Variables

Backend:

```text
ORS_API_KEY=
DJANGO_SECRET_KEY=
DJANGO_DEBUG=False
ALLOWED_HOSTS=
CORS_ALLOWED_ORIGINS=
```

Frontend:

```text
VITE_API_BASE_URL=
```

Never commit real secrets.

Add:

```text
.env
```

to `.gitignore`.

Provide:

```text
.env.example
```

---

# 65. CORS

Configure Django to allow:

```text
Local React frontend
Production React frontend
```

Avoid broad unrestricted CORS unless absolutely necessary.

---

# 66. Deployment

Recommended:

```text
React frontend
→ Vercel

Django backend
→ Render / Railway / similar Python host
```

The exact backend provider is flexible.

Avoid a backend tier that sleeps when idle (§52). If you must use one, keep the `/api/health` wake-up ping and the "waking up" message.

---

# 67. Production Verification

After deployment, manually verify:

```text
Form submission
Map rendering
Short trip
Long trip
Cycle-near-limit trip
Multi-day ELD logs
Responsive layout
Browser console
API network calls
CORS
HTTPS
Refresh behavior
Invalid input
```

Also test the app in:

```text
Incognito/private browsing
```

to catch hidden local-session dependencies.

Additional checks:

```text
First request after the backend has been idle (cold start)
Long trip crossing time zones — logs stay in home terminal time
Sample trip buttons all work
Print / PDF output of the log sheets
Autocomplete responds and does not leak the API key
```

---

# 68. GitHub Repository Structure

Recommended:

```text
project-root/
│
├── frontend/
├── backend/
├── README.md
├── .gitignore
└── .env.example
```

Do not commit:

```text
node_modules
venv
.env
API secrets
local cache files
```

---

# 69. Git Commit Quality

Use meaningful commits:

```text
feat: add route planning API

feat: implement HOS scheduler

feat: add 30-minute break logic

feat: add cycle restart support

feat: generate ELD daily logs

feat: render route map

test: add HOS edge case coverage

style: improve trip planner UI
```

---

# 70. Loom Walkthrough Plan

Keep it between:

```text
3–5 minutes
```

## Minute 0–1

Explain:

```text
What the app does
Required inputs
Route planning
HOS compliance
ELD generation
```

## Minute 1–2

Run a sample trip.

Show:

```text
Route
Fuel stops
Breaks
Rest stops
Estimated timing
```

## Minute 2–3

Show:

```text
Daily ELD logs
Multiple days
Duty status lines
Remarks
Daily totals
```

## Minute 3–4

Open:

```text
hos_scheduler.py
```

Explain:

```text
11-hour rule
14-hour rule
8-hour break
10-hour reset
70-hour cycle
34-hour restart
```

## Minute 4–5

Explain the architecture:

```text
One canonical event timeline
Same events power map + ELD + timeline
Services are separated
Tests cover HOS edge cases
```

Then briefly show the test suite.

---

# 71. Recommended Implementation Order

## Phase 1 — Project Setup

- Create the React app with Vite + TypeScript
- Create the Django app
- Configure API communication
- Configure CORS

## Phase 2 — Routing

- Get an ORS key; verify quotas and the max route distance with your longest demo trip
- Add geocoding and the autocomplete proxy
- Add the `driving-hgv` route call
- Support current → pickup → dropoff
- Resolve the home terminal time zone
- Render the basic route with react-leaflet

## Phase 3 — HOS Engine

Implement in this order:

1. Starting state and quarter-hour grid
2. Pre/post-trip inspections
3. 11-hour limit
4. 14-hour window (driving-only check)
5. 8-hour rule with the general 30-minute reset
6. 10-hour daily reset (Sleeper Berth)
7. Pickup
8. Dropoff
9. 70-hour cycle (driving-only check)
10. 34-hour restart
11. Fuel stops and the fuel/break merge

## Phase 4 — Canonical Events

Create consistent `TripEvent[]` with time-based position interpolation.

## Phase 5 — ELD Data

- Split at midnight (home terminal zone)
- Fill missing daily time
- Calculate daily status totals
- Generate remarks

## Phase 6 — ELD UI

- Full paper log sheet layout with header fields
- SVG grid, 15-minute ticks, duty rows
- Status transitions
- Remarks brackets with rotated labels
- Totals column
- Day tabs

## Phase 7 — Map Stops

Render:

- Pickup
- Dropoff
- Break
- Fuel
- Daily rest
- Cycle restart

## Phase 8 — Timeline + Summary

- Chronological trip timeline
- Trip summary cards

## Phase 9 — UX Polish

- Autocomplete
- Sample trip buttons
- Log details form section
- Loading, cold-start, error, and empty states
- Print / export
- Responsive design

## Phase 10 — Testing

Add all scheduler and ELD test cases (1–27).

## Phase 11 — Deployment

- Deploy frontend
- Deploy backend (always-on preferred)
- Test production CORS
- Test full end-to-end flow, including a cold start

## Phase 12 — Submission

- Final README
- GitHub cleanup
- Loom
- Live URL verification

---

# 72. Main Domain Object

The most important object in the application should be:

```text
TripEvent
```

Example:

```json
{
  "type": "FUEL",
  "duty_status": "ON_DUTY_NOT_DRIVING",
  "start_time": "2026-10-02T14:00:00",
  "end_time": "2026-10-02T14:30:00",
  "duration_minutes": 30,
  "location": {
    "name": "Omaha, NE",
    "latitude": 41.2565,
    "longitude": -95.9345
  },
  "distance_miles": 0,
  "reason": "Fuel required before 1000-mile limit"
}
```

All output views should consume this model.

---

# 73. Recommended Service Flow

```text
RouteService
      ↓
HOSPlanner
      ↓
TripEvent[]
      ↓
 ┌─────────────┬─────────────┬─────────────┐
 │ Map         │ ELD         │ Timeline    │
 └─────────────┴─────────────┴─────────────┘
```

Avoid creating one huge function such as:

```text
calculate_everything()
```

Separate responsibilities cleanly.

---

# 74. Example User Flow

User enters:

```text
Current:
Boston, MA

Pickup:
Chicago, IL

Dropoff:
Los Angeles, CA

Current Cycle:
15h
```

Clicks:

```text
PLAN TRIP
```

Backend:

```text
Geocodes locations
↓
Gets route
↓
Calculates HOS-compliant event timeline
↓
Generates daily logs
↓
Returns route + events + logs
```

Frontend shows:

```text
Trip Overview

Boston → Chicago → Los Angeles

Distance
Driving Time
Total Trip Time
Estimated Arrival
Fuel Stops
Rest Stops
Cycle Remaining
```

Then:

```text
Interactive Route Map
```

Then:

```text
Chronological Route Timeline
```

Then:

```text
ELD Logs

Day 1
Day 2
Day 3
...
```

---

# 75. Definition of Done

Do not submit until all of the following are true.

## Core App

- [ ] React frontend works
- [ ] Django API works
- [ ] Current → Pickup → Dropoff routing works
- [ ] Free map/routing service is integrated

## HOS Rules

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

## Timeline

- [ ] Trip events have start times
- [ ] Trip events have end times
- [ ] Trip events have locations
- [ ] Trip events have duty statuses
- [ ] Midnight splitting works

## ELD

- [ ] Multiple daily logs work
- [ ] Each daily log covers 24 hours
- [ ] Each daily log totals 24 hours
- [ ] Four duty-status rows render
- [ ] Horizontal duty lines render
- [ ] Vertical transitions render
- [ ] Remarks show locations
- [ ] Daily miles display correctly

## Map

- [ ] Route displays
- [ ] Current location marker displays
- [ ] Pickup marker displays
- [ ] Dropoff marker displays
- [ ] Fuel markers display
- [ ] Break markers display
- [ ] Rest markers display
- [ ] Cycle restart markers display

## Consistency

- [ ] Map matches timeline
- [ ] Timeline matches ELD
- [ ] ELD matches backend events
- [ ] Summary totals come from backend events

## Validation

- [ ] Invalid cycle input handled
- [ ] Invalid locations handled
- [ ] API failures handled
- [ ] Routing failures handled

## UI / UX

- [ ] Loading state exists
- [ ] Error state exists
- [ ] Empty state exists
- [ ] Desktop UI is polished
- [ ] Responsive behavior is acceptable
- [ ] Icons do not rely only on color

## Security / Configuration

- [ ] No secrets are committed
- [ ] `.env.example` exists
- [ ] `.gitignore` is correct
- [ ] CORS is configured

## Documentation

- [ ] README explains setup
- [ ] README explains architecture
- [ ] README lists assumptions
- [ ] README lists limitations
- [ ] README includes live URL
- [ ] README includes Loom URL

## Testing

- [ ] HOS tests pass
- [ ] ELD tests pass
- [ ] Midnight splitting tests pass
- [ ] Cycle restart tests pass
- [ ] Fuel/break overlap tests pass

## Deployment

- [ ] Production frontend works
- [ ] Production backend works
- [ ] Production CORS works
- [ ] HTTPS works
- [ ] App works in incognito/private browser

## Submission

- [ ] GitHub repo is shareable
- [ ] Live app is reachable
- [ ] Loom is 3–5 minutes
- [ ] Final example trip works end to end

## Review Fixes

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

---

# 76. Important Assumptions to Explain During Review

These should be explicitly stated in README and, ideally, in the Loom:

1. **Rolling 8-day history is not provided**
   - The assessment gives only `Current Cycle Used`
   - Therefore exact hour roll-off cannot be reconstructed

2. **34-hour restart is used conservatively**
   - When available cycle time is exhausted

3. **Fuel duration is assumed to be 30 minutes**
   - Because the assessment specifies fuel frequency but not duration

4. **Trip start defaults to current date/time**
   - Unless optional departure date/time is provided

5. **10 consecutive hours off duty are used for daily resets**
   - Split sleeper optimization is intentionally out of scope

6. **Missing ELD metadata is not invented**
   - Carrier, driver, vehicle, and shipping data are blank or clearly marked placeholders

7. **Logs use the home terminal time zone**
   - Home terminal = current location; times never switch zones mid-trip

8. **Pre/post-trip inspections are assumed at 15 minutes each**
   - Matches how real logs and the FMCSA sample log look

9. **The 14-hour and 70-hour limits restrict driving, not work**
   - Pickup and dropoff can happen after either limit is reached

10. **Any 30+ minute non-driving period satisfies the 30-minute break**
    - Pickup, dropoff, and fuel stops reset the 8-hour driving clock

---

# 77. Key Technical Message for the Interview / Loom

The strongest way to explain the design is:

> The routing service tells us where the truck needs to go and the raw travel duration. The HOS scheduler turns that raw route into a legally compliant sequence of trip events. That single event timeline becomes the source of truth for the route map, stop markers, trip timeline, summary, and ELD daily logs.

That demonstrates:

- Good domain modeling
- Separation of concerns
- Testability
- Consistency
- Full-stack system design

---

# 78. Final Mental Model

Think of the application as:

```text
ROUTE
  ↓
RAW DISTANCE + DURATION
  ↓
HOS RULE ENGINE
  ↓
CANONICAL TRIP EVENTS
  ↓
 ┌────────────┬────────────┬────────────┬────────────┐
 │ MAP        │ TIMELINE   │ SUMMARY    │ ELD LOGS   │
 └────────────┴────────────┴────────────┴────────────┘
```

The project is not primarily a map application.

It is not primarily an ELD drawing application.

The core of the solution is:

```text
a deterministic HOS-compliant timeline generator
```

Everything else is a visualization of that timeline.
