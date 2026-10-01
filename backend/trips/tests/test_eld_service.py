import unittest
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from common.enums import DUTY_STATUS_BY_EVENT, EventType
from common.types import Location, TripEvent
from services.eld_service import generate_daily_logs

NY = ZoneInfo("America/New_York")


def ev(etype, start, end, miles=0.0, name=None):
    return TripEvent(
        type=etype, duty_status=DUTY_STATUS_BY_EVENT[etype], start=start, end=end,
        leg_index=0, leg_minutes_start=0, leg_minutes_end=0, distance_miles=miles,
        cumulative_miles=0, reason="", location=Location(name, 0, 0) if name else None,
    )


def at(day, h, m=0, tz=NY):
    return datetime(2026, 10, day, h, m, tzinfo=tz)


class EldServiceTest(unittest.TestCase):
    def test_midnight_split(self):
        """Test 11: 23:00 -> 03:00 splits into two days; miles apportioned by time."""
        logs = generate_daily_logs([ev(EventType.DRIVING, at(1, 23), at(2, 3), 200.0, "A")], NY)
        self.assertEqual([l["date"] for l in logs], ["2026-10-01", "2026-10-02"])
        self.assertEqual(logs[0]["segments"][-1], {"status": "DRIVING", "start_minute": 1380, "end_minute": 1440})
        self.assertEqual(logs[1]["segments"][0], {"status": "DRIVING", "start_minute": 0, "end_minute": 180})
        self.assertEqual([l["total_miles"] for l in logs], [50.0, 150.0])
        self.assertEqual(len(logs[1]["remarks"]), 0)  # continuation adds no remark

    def test_leading_trailing_fill_and_remarks(self):
        """Day 1 leading and last-day trailing OFF_DUTY fill; remark labels and locations."""
        logs = generate_daily_logs([
            ev(EventType.PRE_TRIP_INSPECTION, at(1, 7), at(1, 7, 15), name="New York, NY"),
            ev(EventType.DRIVING, at(1, 7, 15), at(1, 10), 100.0, "New York, NY"),
            ev(EventType.DROPOFF, at(1, 10), at(1, 11), name="Toledo, OH"),
        ], NY)
        (d,) = logs
        self.assertEqual(d["segments"][0], {"status": "OFF_DUTY", "start_minute": 0, "end_minute": 420})
        self.assertEqual(d["segments"][-1], {"status": "OFF_DUTY", "start_minute": 660, "end_minute": 1440})
        self.assertEqual(d["totals"], {"OFF_DUTY": 20.0, "SLEEPER_BERTH": 0.0, "DRIVING": 2.75, "ON_DUTY_NOT_DRIVING": 1.25})
        self.assertEqual(d["remarks"][0], {"minute": 420, "location": "New York, NY", "label": "Pre-trip inspection"})
        self.assertEqual(d["remarks"][2]["label"], "Dropoff")
        self.assertEqual((d["from_location"], d["to_location"]), ("New York, NY", "Toledo, OH"))
        self.assertEqual(d["timezone"], "America/New_York")

    def test_three_days_sum_24h_and_quarter_hours(self):
        """Tests 12 and 22: every day sums to 24h; totals are quarter-hour multiples."""
        logs = generate_daily_logs([
            ev(EventType.DRIVING, at(1, 6), at(1, 17), 600.0),
            ev(EventType.DAILY_REST, at(1, 17), at(2, 3)),
            ev(EventType.DRIVING, at(2, 3), at(2, 14, 15), 600.0),
            ev(EventType.CYCLE_RESTART, at(2, 14, 15), at(3, 12, 15)),
        ], NY)
        self.assertEqual(len(logs), 3)
        for l in logs:
            self.assertEqual(sum(l["totals"].values()), 24.0)
            for h in l["totals"].values():
                self.assertEqual(h * 4, int(h * 4))
            for s in l["segments"]:
                self.assertEqual((s["start_minute"] % 15, s["end_minute"] % 15), (0, 0))

    def test_other_zone_split_at_home_midnight(self):
        """Test 21: UTC events split at New York midnight; timezone reported."""
        utc = timezone.utc
        logs = generate_daily_logs([ev(EventType.DRIVING, datetime(2026, 10, 2, 2, 0, tzinfo=utc), datetime(2026, 10, 2, 6, 0, tzinfo=utc), 80.0)], NY)
        self.assertEqual([l["date"] for l in logs], ["2026-10-01", "2026-10-02"])  # 22:00-02:00 local
        self.assertEqual(logs[0]["segments"][-1]["start_minute"], 1320)
        self.assertEqual(logs[1]["segments"][0]["end_minute"], 120)
        self.assertEqual(logs[0]["timezone"], "America/New_York")

    def test_daily_rest_is_sleeper_berth(self):
        """Test 24: DAILY_REST counts as SLEEPER_BERTH."""
        (d,) = generate_daily_logs([ev(EventType.DAILY_REST, at(1, 20), at(1, 21, 45))], NY)
        self.assertEqual(d["totals"]["SLEEPER_BERTH"], 1.75)
        self.assertEqual(d["remarks"][0]["label"], "10-hour rest")


if __name__ == "__main__":
    unittest.main()
