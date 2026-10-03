# HOS Trip Planner: Questions and Answers

Each question is numbered and answered directly, with file references where they help.

---

## A. Overview and architecture

**1. What does the application do?**
A truck driver enters a current location, a pickup location, a dropoff location, and the hours already used in their 70-hour / 8-day cycle. The backend fetches a truck (HGV) route and plans the trip under the FMCSA Hours-of-Service rules. It inserts breaks, fuel stops, 10-hour rests and 34-hour restarts where required. The output is a map with every stop, a timeline, summary totals, and one filled-in paper-style daily log sheet for each calendar day.

**2. What is the tech stack?**
React (Vite + TypeScript) on the frontend, with react-leaflet for the map and hand-written SVG for the log sheets. Django REST Framework on the backend. OpenRouteService (ORS) provides routing and geocoding. There is no database.

**3. What happens, end to end, when a trip is planned?**
1. The React form validates the input and POSTs to `/api/trips/plan`.
2. `views.plan_trip` validates the request with `PlanRequestSerializer`.
3. `views._assemble` resolves the locations, geocoding any that have no coordinates.
4. It routes both legs through ORS `driving-hgv`.
5. It looks up the home-terminal time zone.
6. It runs the HOS scheduler, which returns the event list (`TripEvent[]`).
7. It places each stop on the route and reverse-geocodes its name.
8. It builds the daily logs and the summary totals, and returns JSON.
9. The frontend adapts the JSON and renders the map, the timeline and the log sheets.

**4. What is the central design decision?**
The scheduler produces one ordered event list, and it is the single source of truth. The map markers, the timeline, the summary totals and the daily logs are all built from that list. None of them computes anything separately, so they cannot disagree.

**5. Why is the HOS scheduler pure Python with no Django dependency?**
It holds the most complex logic, so it is the main thing to test. Tests pass route legs in and get events back, with no HTTP, no database and no rendering. The same code could be reused in a CLI or a background job unchanged.

**6. Why is there no database?**
Each request is stateless: input in, plan out. Nothing has to be stored, so a database would only add setup, migrations and hosting cost.

**7. Why do all ORS calls, including autocomplete, go through Django?**
To keep the ORS API key on the server. Anything the browser calls directly can be read by anyone.

**8. What API endpoints exist?**
- `POST /api/trips/plan`: plans a trip.
- `GET /api/geocode/autocomplete?q=`: place suggestions.
- `GET /api/geocode/reverse?lat=&lng=`: the place name for a point picked on the map.
- `GET /api/health`: health check, also used to wake the server.

---

## B. Routes, legs and OpenRouteService

**9. What is a "leg"?**
A leg is one section of the route between two stops that come one after the other. Every trip has two legs:
- Leg 0: current location → pickup (driving empty)
- Leg 1: pickup → dropoff (driving loaded)

`routing_service.route()` makes one ORS request per leg. Each `TripEvent` records its `leg_index` and how many driving minutes into that leg it occurs. That is how a stop's map position is found later.

**10. What does the application get from the ORS directions API?**
`routing_service._leg()` POSTs the two points to `/v2/directions/driving-hgv/geojson` with a 5 km snap radius. From the response it keeps:

| ORS field | Stored as | Used for |
|---|---|---|
| `segments[0].distance` (meters) | `Leg.distance_miles` | Total miles |
| `segments[0].duration` (seconds) | `Leg.duration_minutes` | Total driving time |
| `segments[0].steps[]`: `distance`, `duration`, `way_points` | `Step` list | Speed variation along the road; finding positions |
| `geometry.coordinates` | `Leg.geometry` as (lat, lng) | The map line, and stop positions |
| `error.code` / `error.message` (on failure) | Readable error text | Explaining why no route exists |

Everything else in the response is ignored.

**11. What is a "step"?**
One turn-by-turn instruction from ORS, for example "continue on I-40 for 82 miles, about 75 minutes". Each step has its own distance and duration, so the steps show where the truck moves slowly (cities) and where it moves fast (highways).

**12. Which other ORS endpoints are used?**
- `/geocode/search`: turns typed text into coordinates when no suggestion was picked. Limited to the US, top result only.
- `/geocode/autocomplete`: suggestions while typing. Limited to the US, 5 results.
- `/geocode/reverse`: turns coordinates into a name such as "Amarillo, TX". Used for every intermediate stop and for map clicks.

**13. What happens when the current location and the pickup are the same place?**
If the two points are less than 50 m apart, `_leg()` skips the ORS call and returns an empty leg. The schedule goes straight to the pickup.

**14. What happens when no truck route exists?**
ORS returns an error code, and `_reason()` turns it into a readable sentence:
- 2010: the point is not close enough to a road a truck can use.
- 2004: the leg is longer than ORS allows.
- Anything else: no truck road connects the two points (for example, across open water).

The API returns this as HTTP 422 with the code `no_route`.

---

## C. Hours-of-Service rules in the scheduler

**15. Which rules are implemented?**
The property-carrying driver rules:
- 11 hours of driving per duty period
- a 14-hour on-duty window
- a 30-minute break after 8 hours of driving
- a 10-hour rest between duty periods
- a 70-hour / 8-day cycle, with a 34-hour restart

The plan also includes fuel at least every 1,000 miles, 1 hour each for pickup and dropoff, and 15-minute pre-trip and post-trip inspections. All of these numbers live in `common/constants.py`.

**16. How does the scheduler decide when to stop?**
Before each stretch of driving, `drive_leg()` computes how much driving each limit still allows:

```python
allowed = min(cycle_left, daily_left, window_left, break_left)
```

The truck drives for the smallest of these, or until the fuel point or the end of the leg if that comes first. It then stops for whichever limit was reached.

**17. In what order are the checks made, and why?**
1. Fuel due → FUEL
2. Cycle exhausted → POST_TRIP + 34-hour CYCLE_RESTART
3. 11-hour or 14-hour limit reached → POST_TRIP + 10-hour DAILY_REST
4. Pre-trip inspection, if the driver is off duty
5. 8 hours of driving without a break → BREAK (or FUEL, see Q24)
6. Otherwise, drive

Fuel comes first because it is non-driving work, and no limit blocks non-driving work. The restart is checked before the 10-hour rest so that, when both limits apply at once, the driver does not take a 10-hour rest after which they still could not drive.

**18. Does the 14-hour window or the 70-hour cycle block pickup, dropoff or fuel?**
No. Those limits restrict driving only. Pickup, dropoff, fuel and inspections still count as on-duty time, but no rest is ever inserted before them. This is why the cycle used at the end of a trip can be above 70; the remaining cycle is shown as `max(0, 70 - used)`.

**19. When does the 14-hour window start?**
At the pre-trip inspection, not at the first minute of driving. `_State.add()` records `window_start` on the first on-duty event of a duty period.

**20. What does `restart_needed()` do?**
It checks whether the remaining cycle hours can cover the inspections still required plus at least 15 minutes of driving. The inspections are the pre-trip, and also the post-trip if a rest is due. If the hours cannot cover that, a 34-hour restart is taken immediately instead of a 10-hour rest that would not make any driving possible.

**21. What happens if the driver starts with 70 cycle hours used?**
The trip begins with a 34-hour restart, followed by the pre-trip inspection.

**22. Why are rests taken in the sleeper berth?**
It is a stated planning assumption: the 10-hour rest is logged as Sleeper Berth, and 34-hour restarts and 30-minute breaks as Off Duty. The full mapping is in `common/enums.py` (`DUTY_STATUS_BY_EVENT`).

---

## D. Breaks and fuel

**23. When is a 30-minute break inserted?**
Only when 8 hours of driving have built up without any non-driving period of 30 minutes or more. Pickup, dropoff, fuel and rest periods of at least 30 minutes all reset that counter, so many trips need no separate break.

**24. Fuel is on-duty time. How can a fuel stop count as the break?**
Under the current FMCSA rule, the 30-minute break can be any 30 consecutive minutes of non-driving time, on duty or off duty. When a break is due and the truck has driven at least 600 miles since its last fuel stop, the scheduler inserts a 30-minute FUEL stop instead of a BREAK. That one stop covers both needs.

**25. Why fuel at 950 miles when the limit is 1,000?**
It leaves a 50-mile safety margin. The driving segment that ends at the fuel point is also rounded down to the 15-minute grid, so rounding can never push the truck past 1,000 miles.

**26. How is the fuel point found on the route?**
Fuel is measured in miles, but the scheduler works in minutes. `route_position.minutes_at()` converts "950 miles since the last fuel stop" into minutes of driving along the leg, using the ORS step data.

---

## E. Where stops are placed

**27. How is the city for a break, fuel stop or rest chosen?**
No city is chosen up front. There are three steps:
1. **When:** the scheduler decides the stop's time from the HOS limits and the fuel distance.
2. **Where:** `route_position.position_at()` finds the truck's latitude and longitude after that many minutes of driving on the leg.
3. **Name:** ORS reverse geocoding names the point, for example "Amarillo, TX".

The pickup and dropoff keep the names the user entered.

**28. Why are positions calculated from elapsed time along the route instead of average speed?**
Speed varies along a route. `position_at()` walks the ORS steps, adding up their durations, until it reaches the stop's minute. It then interpolates along that step's geometry, so 30 minutes in city traffic covers less distance than 30 minutes on a highway.

**29. How is reverse geocoding kept fast and reliable?**
- Lookups run in parallel (`ThreadPoolExecutor` with 8 workers).
- Results are cached (`lru_cache`).
- Coordinates are rounded to 2 decimal places (about 1 km), so nearby stops share one lookup.
- If a lookup fails, the stop is labelled with its coordinates instead, so the plan never fails because of a name.

**30. Are stops placed at real truck stops or fuel stations?**
No. Stops are placed wherever the HOS clock or the fuel distance requires. Searching for real truck stops or fuel stations is outside the current scope.

---

## F. Time, rounding and daily logs

**31. Why is time rounded to 15 minutes?**
Paper daily logs are drawn on a 15-minute grid. The rules are:
- The trip start rounds up.
- A drive that ends at a stop rounds up, which logs more time and is the conservative choice.
- A drive cut at the fuel point rounds down, so 1,000 miles is never exceeded.

**32. What are the "two clocks" in the scheduler?**
- **Logged minutes** sit on the 15-minute grid and drive every HOS counter.
- **Real minutes** are unrounded and drive the truck's position and miles.

They differ only when the truck arrives at a stop. Without this split, rounding would place the truck past the pickup on the map.

**33. Which time zone are the logs in?**
The home-terminal time zone, which is taken to be the zone of the current location. `timezone_service.home_timezone()` looks it up offline with `timezonefinder`. Days split at that zone's midnight even if the truck crosses into another zone, and the zone name is printed on each log sheet.

**34. How is a daily log built?**
`eld_service.generate_daily_logs()`:
1. Cuts every event at home-terminal midnight.
2. Fills any time before the first event and after the last with Off Duty.
3. Merges neighbouring segments with the same status.
4. Totals the four rows (Off Duty, Sleeper Berth, Driving, On Duty).
5. Adds a remark (place and activity) for each event.

**35. How is a daily log checked for correctness?**
The backend asserts that each day's four rows add up to exactly 1,440 minutes and start at minute 0. The frontend log sheet also checks that each day's rows total 24 hours and reports an error if they do not.

**36. How is daylight saving time handled?**
The scheduler does its time arithmetic in UTC, so a 10-hour rest that crosses a DST change is still 10 real hours. Both cases are covered by tests. The log sheet treats every day as 1,440 minutes; on the two DST-change days a year, the extra or missing hour is absorbed. This is a documented limitation.

**37. How is the log sheet drawn?**
`LogSheet.tsx` draws the FMCSA paper form as hand-written SVG, with no chart library. It includes the header, a 24-hour grid with 15-minute ticks, the four duty-status rows, the duty line as one SVG path, row totals, remarks with brackets and angled labels, and the recap section. `PrintView` prints one sheet per page.

---

## G. Input validation, errors and security

**38. How is input validated?**
On both sides:
- **Client:** `TripFormPanel.validate()` checks that the fields are filled in and that cycle hours are between 0 and 70.
- **Server:** `PlanRequestSerializer` checks the same rules plus more. Latitude and longitude must be sent together and be in range. `FiniteFloatField` rejects NaN and infinity, which would otherwise pass min/max checks. The start time must be valid ISO 8601.

**39. How are errors returned to the frontend?**
`trips/exceptions.api_exception_handler` returns every error in the same shape, `{error: {code, message, field?}}`:

| Situation | HTTP status | Code |
|---|---|---|
| Invalid input | 400 | `invalid_input` |
| Location not found | 422 | `location_not_found` |
| No truck route | 422 | `no_route` |
| ORS unavailable | 503 | `routing_unavailable` |
| ORS timeout | 504 | `routing_timeout` |
| Anything else | 500 | `unexpected` (logged on the server, generic message to the user) |

When the error names a field, the frontend shows the message under that input.

**40. Can the ORS API key appear in an error message?**
No. `common/errors.provider_reason()` builds its message only from the ORS response body, never from the request URL, which contains the key.

**41. What happens if `DJANGO_SECRET_KEY` is missing in production?**
Outside debug mode the key is set to an empty string, and Django refuses to start. The insecure development key is used only when `DJANGO_DEBUG` is on.

**42. What happens if the user submits twice quickly?**
`App.plan` gives each request an id (`run.current`). A response whose id is no longer the latest is ignored, so an older request cannot overwrite a newer result. Autocomplete and the map picker use the same idea with a `stale` flag.

---

## H. Frontend

**43. How is the API response turned into what the screen shows?**
`utils/adapter.fromApi()`:
1. Converts each timestamp into hours since day-1 midnight on the home-terminal clock, using `Intl`, so the browser's own time zone never matters.
2. Maps event types to display kinds.
3. Fills the start of the first day and the end of the last with off-duty time.

`utils/trip.derive()` then builds the per-day totals, summary cards, rule-check peaks and stop list, all from the events.

**44. How is state managed?**
With plain React state in `App.tsx`; no Redux. The app moves between four modes: `planner → loading → results → print`.

**45. How does autocomplete work?**
`TripFormPanel` waits 300 ms after the last keystroke, needs at least 3 characters, and ignores out-of-date responses. Picking a suggestion stores the label and the coordinates, so the backend skips geocoding for that field. Editing the field afterwards clears the stored coordinates. A location can also be picked by clicking on a map.

**46. Why is the request timeout 90 seconds?**
The hosted backend sleeps when idle and can take close to a minute to wake. The app also calls `/api/health` when it loads, so the server starts waking while the user is still filling in the form.

**47. What does the map show?**
The route as two lines: dashed for the empty leg to the pickup, solid for the loaded leg. Each stop has a marker. A marker's popup shows the arrival time (home-terminal time, plus local time if different), the duration, the duty status, the reason for the stop, and a link to that day's log. The map can be filtered by day.

---

## I. Testing

**48. How is the code tested?**
- **Backend:** Django tests in `backend/trips/tests/`. ORS is mocked and no database is needed. `test_scheduler.py` covers the required scenarios, including:
  - the 8-hour break, the 11-hour limit and the 14-hour window
  - pickup and dropoff
  - fuel, and fuel combined with the break
  - cycle near the limit, and starting at 70
  - restart winning over rest
  - DST
  - multi-day trips split at home-terminal midnight
  - a set of varied trips checked against general invariants

  Other test files cover the daily logs, route positions, routing, geocoding, time zones and the API.
- **Frontend:** vitest tests for API error mapping, the adapter, and log-sheet geometry.

**49. How are the tests run?**
- Backend: `cd backend && .venv/bin/python manage.py test trips`
- Frontend: `cd frontend && npm test`

---

## J. Scope and limitations

**50. What is out of scope?**
Split sleeper berth, adverse driving conditions, short-haul exceptions, personal conveyance and yard moves.

**51. Why is the rolling 8-day cycle not tracked day by day?**
The input gives only the total hours used, not a day-by-day history, so it is not possible to know which hours expire when. The planner treats all used hours as current. That is conservative: it can only plan a restart earlier than strictly necessary, never later.

**52. What are the known limitations?**
- Stops are placed by the clock, not at real truck stops or fuel stations.
- On DST-change days the log sheet uses a fixed 24-hour day.
- The reverse-geocoding cache is per server process, and there is no rate limiting in front of the ORS quota.
- When a fuel stop also covers the 30-minute break, the map and timeline show it as "Fuel". The backend's reason text records that it doubles as the break, but the frontend does not display it.
- The frontend draws the log sheets from the events itself rather than from the backend's `daily_logs`. Both come from the same events, and each side checks its own 24-hour totals.

**53. What would be improved next?**
1. Move break, rest and fuel stops to real truck stops and fuel stations found shortly before each deadline.
2. Accept an 8-day duty history so the rolling cycle can be computed exactly.
3. Add a shared cache (for example Redis) and per-client rate limiting if traffic grows.
