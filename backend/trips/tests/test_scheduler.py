import unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from common.constants import (
    CYCLE_RESTART_HOURS, MAX_CYCLE_HOURS, MAX_DRIVING_HOURS, MAX_DUTY_WINDOW_HOURS,
    MAX_MILES_BETWEEN_FUEL, REQUIRED_REST_HOURS, TIME_GRID_MINUTES,
)
from common.enums import DutyStatus, EventType
from common.types import Leg, Step
from services.hos_scheduler import plan_schedule

E, D = EventType, DutyStatus
NY = ZoneInfo("America/New_York")
START = datetime(2026, 3, 2, 8, 0, tzinfo=NY)
H = 60
ON_DUTY = (D.DRIVING, D.ON_DUTY_NOT_DRIVING)


def leg(minutes, mph=50.0, steps=1):
    """Synthetic constant-speed leg split into `steps` equal steps."""
    if not minutes:
        return Leg(0, 0, [], [(0.0, 0.0)])
    n = steps
    return Leg(
        minutes * mph / 60, minutes,
        [Step(minutes * mph / 60 / n, minutes / n, (i, i + 1)) for i in range(n)],
        [(0.0, float(i)) for i in range(n + 1)],
    )


def mins(e):
    """Real elapsed minutes (timestamps, so DST nights are not wall-clock-skewed)."""
    return (e.end.timestamp() - e.start.timestamp()) / 60


def cycle_minutes(cycle_hours, events):
    """Cycle used at the end of `events`, recomputed from on-duty time."""
    c = cycle_hours * H
    for e in events:
        c = 0 if e.type == E.CYCLE_RESTART else c + (mins(e) if e.duty_status in ON_DUTY else 0)
    return c


def types(events):
    return [e.type for e in events]


def check_invariants(tc, legs, cycle_hours, events):
    """Every property the schedule must hold, recomputed from the events alone."""
    tc.assertTrue(events)
    tz = events[0].start.tzinfo
    prev_end = None
    since_break = nondriving = 0.0
    cycle = cycle_hours * H
    miles_since_fuel = 0.0
    period, periods = [], []
    for i, e in enumerate(events):
        for t in (e.start, e.end):
            tc.assertIsNotNone(t.tzinfo)
            tc.assertIs(t.tzinfo, tz)
            tc.assertEqual((t.minute % TIME_GRID_MINUTES, t.second, t.microsecond), (0, 0, 0))
        tc.assertGreater(mins(e), 0, "no zero-duration events")
        if prev_end is not None:
            tc.assertEqual(e.start, prev_end, "events must be contiguous")
        prev_end = e.end
        tc.assertIsNotNone(e.leg_index)
        if e.type == E.DRIVING:
            tc.assertLess(cycle, MAX_CYCLE_HOURS * H, "no driving once the cycle hits 70h")
            cycle += mins(e)
            tc.assertLessEqual(cycle, MAX_CYCLE_HOURS * H + 1e-9)
            since_break += mins(e)
            nondriving = 0
            tc.assertLessEqual(since_break, 8 * H, "8h driving without a 30-min break")
            miles_since_fuel += e.distance_miles
            tc.assertLessEqual(miles_since_fuel, MAX_MILES_BETWEEN_FUEL)
            tc.assertGreaterEqual(mins(e) + 1e-9, e.leg_minutes_end - e.leg_minutes_start)
        else:
            tc.assertEqual(e.leg_minutes_start, e.leg_minutes_end)
            tc.assertEqual(e.distance_miles, 0)
            nondriving += mins(e)
            if nondriving >= 30:
                since_break = 0
            if e.duty_status in ON_DUTY:
                cycle += mins(e)
        if e.type == E.FUEL:
            miles_since_fuel = 0
        if e.type in (E.DAILY_REST, E.CYCLE_RESTART):
            if period:
                periods.append(period)
            period = []
            tc.assertIn(E.DRIVING, types(events[i:]), "rest/restart only when more driving is needed")
            nxt = types(events[i + 1:])
            tc.assertLess(nxt.index(E.DRIVING), nxt.index(E.DROPOFF))
            if e.type == E.CYCLE_RESTART:
                cycle = 0
                tc.assertEqual(mins(e), CYCLE_RESTART_HOURS * H)
                tc.assertEqual(e.duty_status, D.OFF_DUTY)
            else:
                tc.assertEqual(mins(e), REQUIRED_REST_HOURS * H)
                tc.assertEqual(e.duty_status, D.SLEEPER_BERTH)
        else:
            period.append(e)
    periods.append(period)
    for p in periods:
        tc.assertEqual(p[0].type, E.PRE_TRIP_INSPECTION)
        tc.assertEqual(p[-1].type, E.POST_TRIP_INSPECTION)
        drives = [e for e in p if e.type == E.DRIVING]
        tc.assertTrue(drives or {E.PICKUP, E.DROPOFF} & set(types(p)), "duty period with no driving")
        tc.assertLessEqual(sum(mins(e) for e in drives), MAX_DRIVING_HOURS * H)
        for d in drives:
            tc.assertLessEqual(d.end.timestamp() - p[0].start.timestamp(), MAX_DUTY_WINDOW_HOURS * 3600)
    tc.assertEqual(types(events)[-2:], [E.DROPOFF, E.POST_TRIP_INSPECTION])
    total = sum(l.distance_miles for l in legs)
    tc.assertAlmostEqual(sum(e.distance_miles for e in events if e.type == E.DRIVING), total, places=6)
    tc.assertAlmostEqual(events[-1].cumulative_miles, total, places=6)
    for idx, l in enumerate(legs):
        drives = [e for e in events if e.type == E.DRIVING and e.leg_index == idx]
        pos = 0.0
        for d in drives:
            tc.assertAlmostEqual(d.leg_minutes_start, pos, places=6)
            pos = d.leg_minutes_end
        tc.assertAlmostEqual(pos, l.duration_minutes, places=6, msg="leg minutes not fully consumed")
    for e in events:
        tc.assertIsNotNone(e.reason)
        tc.assertTrue(e.reason.strip())


class SchedulerTests(unittest.TestCase):
    def plan(self, legs, cycle=0.0, start=START):
        events = plan_schedule(legs, cycle, start)
        check_invariants(self, legs, cycle, events)
        return events

    def test_1_short_trip(self):
        """Test 1: 5h driving, cycle 0: no break, no daily rest, no fuel."""
        ev = self.plan([leg(60), leg(240)])
        self.assertEqual(types(ev), [E.PRE_TRIP_INSPECTION, E.DRIVING, E.PICKUP, E.DRIVING,
                                     E.DROPOFF, E.POST_TRIP_INSPECTION])
        self.assertEqual(sum(mins(e) for e in ev if e.type == E.DRIVING), 5 * H)

    def test_2_eight_hour_break(self):
        """Test 2: a 10h single driving leg gives 8h drive, 30m BREAK, 2h drive."""
        ev = self.plan([leg(0), leg(600)])
        core = [(e.type, mins(e)) for e in ev if e.type in (E.DRIVING, E.BREAK, E.FUEL)]
        self.assertEqual(core, [(E.DRIVING, 480), (E.BREAK, 30), (E.DRIVING, 120)])
        brk = next(e for e in ev if e.type == E.BREAK)
        self.assertEqual(brk.duty_status, D.OFF_DUTY)
        self.assertIn("8 hours", brk.reason)

    def test_3_eleven_hour_limit(self):
        """Test 3: 15h raw driving caps at 11h, then 10h sleeper rest, then the remainder."""
        ev = self.plan([leg(0), leg(900)])
        rest = ev.index(next(e for e in ev if e.type == E.DAILY_REST))
        self.assertEqual(sum(mins(e) for e in ev[:rest] if e.type == E.DRIVING), 11 * H)
        self.assertEqual(sum(mins(e) for e in ev[rest:] if e.type == E.DRIVING), 4 * H)
        self.assertEqual(types(ev[rest - 1:rest + 2]),
                         [E.POST_TRIP_INSPECTION, E.DAILY_REST, E.PRE_TRIP_INSPECTION])
        self.assertIn("11-hour", ev[rest].reason)

    def test_4_fourteen_hour_window(self):
        """Test 4: pickup plus many fuel stops; the 14h window, not 11h, stops driving."""
        ev = self.plan([leg(0), leg(1500, mph=600)])  # fuel every ~95 min
        rest = ev.index(next(e for e in ev if e.type == E.DAILY_REST))
        first = ev[:rest]
        driven = sum(mins(e) for e in first if e.type == E.DRIVING)
        self.assertLess(driven, 11 * H)
        last_drive = [e for e in first if e.type == E.DRIVING][-1]
        self.assertEqual(last_drive.end, first[0].start + timedelta(hours=14))
        self.assertIn("14-hour", ev[rest].reason)

    def test_5_pickup(self):
        """Test 5: PICKUP is 1h on duty and counts toward the cycle (here it exhausts it)."""
        ev = self.plan([leg(15), leg(120)], cycle=68.5)  # 68.5h + 15 pre + 15 drive + 60 pickup = 70h
        i = types(ev).index(E.PICKUP)
        self.assertEqual((mins(ev[i]), ev[i].duty_status), (60, D.ON_DUTY_NOT_DRIVING))
        self.assertEqual(types(ev[i + 1:i + 4]),
                         [E.POST_TRIP_INSPECTION, E.CYCLE_RESTART, E.PRE_TRIP_INSPECTION])
        self.assertEqual(cycle_minutes(68.5, ev[:i + 1]) - cycle_minutes(68.5, ev[:i]), 60)
        # Exactly 1h: 15 min less input cycle leaves exactly one 15-min drive before the restart.
        ev = self.plan([leg(15), leg(120)], cycle=68.25)
        i = types(ev).index(E.PICKUP)
        self.assertEqual([(e.type, mins(e)) for e in ev[i + 1:i + 4]],
                         [(E.DRIVING, 15), (E.POST_TRIP_INSPECTION, 15), (E.CYCLE_RESTART, 34 * H)])

    def test_6_dropoff(self):
        """Test 6: DROPOFF is 1h on duty, followed by the post-trip inspection."""
        ev = self.plan([leg(30), leg(90)])
        d = ev[-2]
        self.assertEqual((d.type, mins(d), d.duty_status), (E.DROPOFF, 60, D.ON_DUTY_NOT_DRIVING))
        self.assertEqual(mins(ev[-1]), 15)
        self.assertEqual(cycle_minutes(10, ev[:-1]) - cycle_minutes(10, ev[:-2]), 60)
        self.assertEqual(cycle_minutes(10, ev), 10 * H + 15 + 30 + 60 + 90 + 60 + 15)

    def test_7_fuel(self):
        """Test 7: a 1,500-mile trip fuels before 1,000 miles."""
        ev = self.plan([leg(0), leg(1800)])  # 1,500 mi at 50 mph
        fuels = [e for e in ev if e.type == E.FUEL]
        self.assertGreaterEqual(len(fuels), 1)
        self.assertLess(fuels[0].cumulative_miles, MAX_MILES_BETWEEN_FUEL)

    def test_8_long_fuel_route(self):
        """Test 8: a 2,600-mile trip has at least two fuel stops."""
        ev = self.plan([leg(120), leg(3000, steps=7)])
        self.assertGreaterEqual(types(ev).count(E.FUEL), 2)

    def test_9_cycle_near_limit(self):
        """Test 9: cycle 68h, pickup 1h, 2h driving: never drives past the cycle."""
        ev = self.plan([leg(0), leg(120)], cycle=68)
        # 68h + 15 pre + 60 pickup leaves 45 min of driving, then restart.
        self.assertEqual([(e.type, mins(e)) for e in ev if e.type in (E.DRIVING, E.CYCLE_RESTART)],
                         [(E.DRIVING, 45), (E.CYCLE_RESTART, 34 * H), (E.DRIVING, 75)])
        self.assertNotIn(E.DAILY_REST, types(ev))

    def test_10_cycle_restart_at_70(self):
        """Test 10: cycle 70 starts with a 34h restart, then pre-trip, then driving."""
        ev = self.plan([leg(60), leg(60)], cycle=70)
        self.assertEqual(types(ev)[:3], [E.CYCLE_RESTART, E.PRE_TRIP_INSPECTION, E.DRIVING])
        self.assertEqual((mins(ev[0]), ev[0].duty_status), (34 * H, D.OFF_DUTY))
        self.assertEqual(ev[0].start, START)

    def test_14_fuel_break_overlap(self):
        """Test 14: fuel due exactly when the break is due gives one 30m FUEL, no BREAK."""
        ev = self.plan([leg(0), leg(600, mph=950 / 8)])  # 950 mi at exactly 8h
        stops = [e for e in ev if e.type in (E.FUEL, E.BREAK)]
        self.assertEqual([(e.type, mins(e)) for e in stops], [(E.FUEL, 30)])

    def test_18_pickup_satisfies_break(self):
        """Test 18: 5h drive, 1h pickup, long leg: no BREAK before the 11h limit binds."""
        ev = self.plan([leg(300), leg(1200)])
        rest = types(ev).index(E.DAILY_REST)
        self.assertNotIn(E.BREAK, types(ev[:rest]))
        self.assertEqual(sum(mins(e) for e in ev[:rest] if e.type == E.DRIVING), 11 * H)

    def test_19_dropoff_after_window(self):
        """Test 19: arrival exactly at 14h window expiry: DROPOFF, POST_TRIP, end; no rest."""
        ev = self.plan([leg(0), leg(585, mph=600)])
        self.assertNotIn(E.DAILY_REST, types(ev))
        self.assertEqual(ev[-2].start, ev[0].start + timedelta(hours=14))
        # Test 23 part: post-trip after the 14th hour is allowed.
        self.assertGreater(ev[-1].end, ev[0].start + timedelta(hours=14))

    def test_20_dropoff_with_cycle_exhausted(self):
        """Test 20: cycle hits 70h on arrival at dropoff: DROPOFF, POST_TRIP, no restart."""
        ev = self.plan([leg(0), leg(120)], cycle=70 - 195 / 60)  # pre 15 + pickup 60 + drive 120
        self.assertNotIn(E.CYCLE_RESTART, types(ev))
        self.assertEqual(types(ev)[-3:], [E.DRIVING, E.DROPOFF, E.POST_TRIP_INSPECTION])

    def test_21_home_terminal_zone(self):
        """Test 21 (scheduler half): every event time stays in the home terminal zone."""
        ev = self.plan([leg(600), leg(2400, steps=5)])
        for e in ev:
            self.assertEqual((e.start.tzinfo, e.end.tzinfo), (NY, NY))

    def test_22_start_rounded_up_to_grid(self):
        """Test 22 (scheduler half): start rounds up to 15 min; awkward durations stay on grid."""
        ev = self.plan([leg(37.3), leg(487.3, steps=3)], start=START.replace(minute=7, second=30))
        self.assertEqual(ev[0].start, START.replace(minute=15))
        self.assertEqual(self.plan([leg(10), leg(10)], start=START)[0].start, START)

    def test_23_inspections(self):
        """Test 23: every duty period starts with PRE_TRIP and ends with POST_TRIP."""
        ev = self.plan([leg(300), leg(3300, steps=4)])  # multi-day; checked by check_invariants
        self.assertGreaterEqual(types(ev).count(E.DAILY_REST), 2)
        self.assertEqual(ev[0].type, E.PRE_TRIP_INSPECTION)

    def test_25_current_equals_pickup(self):
        """Test 25: zero-length first leg gives PRE_TRIP, PICKUP, then driving."""
        ev = self.plan([leg(0), leg(120)])
        self.assertEqual(types(ev)[:3], [E.PRE_TRIP_INSPECTION, E.PICKUP, E.DRIVING])
        self.assertEqual(ev[1].leg_index, 0)

    def test_27_fuel_merge_at_break(self):
        """Test 27: break due at 8h with 620 mi since fuel gives one FUEL, no BREAK."""
        ev = self.plan([leg(0), leg(1500, mph=620 / 8)])
        self.assertNotIn(E.BREAK, types(ev))
        fuel = next(e for e in ev if e.type == E.FUEL)
        self.assertAlmostEqual(fuel.cumulative_miles, 620)
        self.assertEqual(mins(fuel), 30)
        self.assertIn("break", fuel.reason)
        # milesSinceFuel and drivingSinceBreak reset: the next stop needs 8h more driving or 950 mi.
        i = ev.index(fuel)
        self.assertEqual(ev[i + 1].type, E.DRIVING)
        j = next(k for k in range(i + 1, len(ev)) if ev[k].type in (E.BREAK, E.FUEL))
        driven = sum(mins(e) for e in ev[i + 1:j] if e.type == E.DRIVING)
        self.assertTrue(driven >= 8 * H or ev[j].cumulative_miles - fuel.cumulative_miles >= 950 - 1e-6)

    def test_waypoint_rounding_never_crosses_a_limit(self):
        """Ruling: rounding a waypoint arrival up must not cross the 8h limit."""
        ev = self.plan([leg(0), leg(487.3)])  # ceil would be 495 > 480
        core = [(e.type, mins(e)) for e in ev if e.type in (E.DRIVING, E.BREAK)]
        self.assertEqual(core, [(E.DRIVING, 480), (E.BREAK, 30), (E.DRIVING, 15)])

    def test_limit_at_pickup_pickup_first(self):
        """Ruling: 11h reached exactly on arrival at pickup: pickup, then the rest."""
        ev = self.plan([leg(660), leg(60)])
        i = types(ev).index(E.PICKUP)
        self.assertEqual(types(ev[i:i + 4]), [E.PICKUP, E.POST_TRIP_INSPECTION, E.DAILY_REST,
                                             E.PRE_TRIP_INSPECTION])

    def test_restart_wins_when_cycle_and_11h_bind_together(self):
        """Section 17: 11h and 70h exhausted together gives CYCLE_RESTART, not DAILY_REST."""
        ev = self.plan([leg(0), leg(900)], cycle=57.75)  # 15 pre + 60 pickup + 660 drive = 12.25h
        self.assertNotIn(E.DAILY_REST, types(ev))
        self.assertEqual(types(ev).count(E.CYCLE_RESTART), 1)

    def test_cycle_nearly_exhausted_mid_trip_restarts_instead_of_resting(self):
        """Repro A: when a 10h rest would leave no cycle to drive after the next pre-trip, restart."""
        ev = self.plan([leg(0), leg(900)], cycle=57.25)
        self.assertNotIn(E.DAILY_REST, types(ev))
        i = types(ev).index(E.CYCLE_RESTART)
        self.assertEqual(types(ev[i - 1:i + 3]), [E.POST_TRIP_INSPECTION, E.CYCLE_RESTART,
                                                 E.PRE_TRIP_INSPECTION, E.DRIVING])

    def test_cycle_nearly_exhausted_at_start_restarts_first(self):
        """Repro B: under 30 min of cycle (pre-trip + one 15-min drive) starts with the restart."""
        for cycle in (69.51, 69.6, 69.74, 69.75, 69.9):
            with self.subTest(cycle=cycle):
                ev = self.plan([leg(60), leg(60)], cycle=cycle)
                self.assertEqual(types(ev)[:3], [E.CYCLE_RESTART, E.PRE_TRIP_INSPECTION, E.DRIVING])
        ev = self.plan([leg(60), leg(60)], cycle=69.5)  # exactly 30 min: pre-trip + 15 min of legal driving
        self.assertEqual([(e.type, mins(e)) for e in ev[:2]], [(E.PRE_TRIP_INSPECTION, 15), (E.DRIVING, 15)])
        ev = self.plan([leg(60), leg(60)], cycle=69.25)  # 45 min left: pre-trip + 15 + more driving
        self.assertEqual([(e.type, mins(e)) for e in ev[:3]],
                         [(E.PRE_TRIP_INSPECTION, 15), (E.DRIVING, 30), (E.POST_TRIP_INSPECTION, 15)])

    def test_miles_match_leg_summary_when_steps_drift(self):
        """Driving miles sum to leg.distance_miles even when ORS steps do not add up exactly."""
        drift = [
            Leg(150, 179.8, [Step(75, 90, (0, 1)), Step(75, 90, (1, 2))], [(0, 0), (0, 1), (0, 2)]),
            Leg(1000, 1200, [Step(499.5, 600, (0, 1)), Step(499.5, 600, (1, 2))], [(0, 0), (0, 1), (0, 2)]),
            Leg(130, 120, [Step(120, 120, (0, 1)), Step(10, 0, (1, 2))], [(0, 0), (0, 1), (0, 2)]),
        ]
        for d in drift:
            with self.subTest(leg=d.distance_miles):
                self.plan([leg(30), d])  # check_invariants asserts the miles sum

    def test_start_in_repeated_dst_hour_keeps_fold(self):
        """Rounding 01:05 CST (second 01:xx on 2026-11-01, fold=1) gives 01:15 CST, not 01:15 CDT."""
        chi = ZoneInfo("America/Chicago")
        start = datetime(2026, 11, 1, 1, 5, tzinfo=chi, fold=1)
        ev = plan_schedule([leg(60), leg(60)], 0, start)
        self.assertEqual(ev[0].start.timestamp() - start.timestamp(), 10 * 60)

    def test_dst_rest_is_real_hours(self):
        """Spring-forward night (2026-03-08 in New York): rests are 10 real hours, still on grid."""
        ev = self.plan([leg(0), leg(1500)], start=datetime(2026, 3, 7, 12, 0, tzinfo=NY))
        rest = next(e for e in ev if e.type == E.DAILY_REST)
        self.assertEqual(rest.start.date().isoformat(), "2026-03-08")
        self.assertEqual(mins(rest), 600)
        self.assertNotEqual((rest.end - rest.start), timedelta(hours=10))  # wall clock shows 11h

    def test_invariants_varied_trips(self):
        """Tests 22/23 and invariants over varied trips."""
        cases = [
            ([leg(60), leg(240)], 0),
            ([leg(0), leg(660)], 0),
            ([leg(200, steps=3), leg(2800 / 50 * 60, steps=9)], 0),  # coast to coast ~2,800 mi
            ([leg(120), leg(2000, mph=55, steps=4)], 65),
            ([leg(45.5), leg(900.2, steps=2)], 70),
            ([leg(0), leg(3000, mph=62)], 30.4),
            ([leg(487.3), leg(487.3, mph=71)], 12.3),
            ([leg(13.7), leg(5000, mph=45, steps=11)], 55.55),
            ([leg(0), leg(900)], 57.25),
            ([leg(200), leg(1400)], 69.6),
            ([leg(0), leg(4000, mph=70, steps=3)], 69.9),
        ]
        for legs, cycle in cases:
            with self.subTest(cycle=cycle, minutes=[l.duration_minutes for l in legs]):
                self.plan(legs, cycle)


class HomeTimezoneTests(unittest.TestCase):
    def test_multi_day_trip_keeps_home_zone_and_splits_at_home_midnight(self):
        """Test 21: events stay in the home zone; logs split at home midnight and report the zone."""
        from services.eld_service import generate_daily_logs
        events = plan_schedule([leg(10 * H), leg(30 * H)], 0, START)
        for e in events:
            self.assertEqual((e.start.tzinfo, e.end.tzinfo), (NY, NY))
        logs = generate_daily_logs(events, NY)
        self.assertGreaterEqual(len(logs), 3)
        self.assertEqual([l["date"] for l in logs],
                         [(events[0].start.date() + timedelta(days=i)).isoformat() for i in range(len(logs))])
        self.assertEqual({l["timezone"] for l in logs}, {"America/New_York"})
        for l in logs:
            self.assertEqual(sum(l["totals"].values()), 24.0)


if __name__ == "__main__":
    unittest.main()
