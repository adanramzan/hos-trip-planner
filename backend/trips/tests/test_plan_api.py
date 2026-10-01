from datetime import datetime
from unittest.mock import patch

import requests
from django.test import SimpleTestCase
from rest_framework.test import APIClient

from common.errors import LocationNotFound, RoutingTimeout, RoutingUnavailable
from common.types import Leg, Location, Step

NY, CHI, LA = (40.71, -74.0), (41.88, -87.63), (34.05, -118.24)
URL = "/api/trips/plan"


def make_leg(minutes, a, b, mph=55.0, n=4):
    """Synthetic constant-speed leg from a to b with n equal steps."""
    if not minutes:
        return Leg(0.0, 0.0, [], [a])
    geo = [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]
    miles = minutes * mph / 60
    return Leg(miles, minutes, [Step(miles / n, minutes / n, (i, i + 1)) for i in range(n)], geo)


def body(**over):
    d = {"current_location": {"label": "New York, NY", "lat": NY[0], "lng": NY[1]},
         "pickup_location": {"label": "Chicago, IL", "lat": CHI[0], "lng": CHI[1]},
         "dropoff_location": {"label": "Los Angeles, CA", "lat": LA[0], "lng": LA[1]},
         "current_cycle_used": 18, "start_datetime": "2026-10-01T08:00:00-04:00",
         "log_details": {"driver_name": "Ann", "truck_number": "7"}}
    d.update(over)
    return d


def reverse(points):
    return ["Stop %d" % i for i, _ in enumerate(points)]


# 5xx responses trigger django.request logging; its admin-mail handler needs a SECRET_KEY the test env lacks
@patch("django.utils.log.AdminEmailHandler.emit", new=lambda *a: None)
class PlanApiTests(SimpleTestCase):
    def setUp(self):
        self.c = APIClient()
        self.legs = [make_leg(12 * 60, NY, CHI), make_leg(30 * 60, CHI, LA)]

    def post(self, data, legs=None):
        with patch("services.routing_service.route", return_value=legs or self.legs), \
                patch("services.geocoding_service.reverse_many", side_effect=reverse) as rev:
            self.rev = rev
            return self.c.post(URL, data, format="json")

    def test_full_plan_shape(self):
        """Test 12 and Test 22: response shape, 24h daily logs, 15-minute boundaries."""
        r = self.post(body())
        self.assertEqual(r.status_code, 200)
        j = r.json()
        self.assertEqual(set(j), {"trip", "route", "events", "daily_logs", "log_details"})
        t = j["trip"]
        self.assertEqual(set(t), {"distance_miles", "driving_hours", "elapsed_hours", "days", "fuel_stops", "breaks",
                                  "rest_stops", "restarts", "cycle_used_start", "cycle_used_end", "cycle_remaining",
                                  "start_time", "end_time", "timezone", "timezone_abbr"})
        self.assertEqual(t["driving_hours"], 42.0)
        self.assertEqual(t["cycle_used_start"], 18)
        self.assertGreaterEqual(t["rest_stops"], 1)
        self.assertEqual(t["rest_stops"], sum(e["type"] == "DAILY_REST" for e in j["events"]))
        self.assertEqual(t["cycle_remaining"], max(0, 70 - t["cycle_used_end"]))
        self.assertEqual(t["days"], len(j["daily_logs"]))
        self.assertEqual(r.json()["log_details"], {"driver_name": "Ann", "truck_number": "7"})
        rt = j["route"]
        self.assertEqual(rt["pickup_index"], len(self.legs[0].geometry))
        self.assertEqual(len(rt["geometry"]), 10)
        self.assertEqual(rt["current_location"], {"label": "New York, NY", "lat": NY[0], "lng": NY[1]})
        self.assertEqual(set(rt), {"geometry", "pickup_index", "current_location", "pickup_location", "dropoff_location"})
        for e in j["events"]:
            self.assertEqual(set(e), {"type", "duty_status", "start_time", "end_time", "duration_minutes", "location",
                                      "end_location", "distance_miles", "cumulative_miles", "reason"})
            for k in ("location", "end_location"):
                self.assertEqual(set(e[k]), {"name", "lat", "lng", "utc_offset_minutes"})
                self.assertTrue(e[k]["name"])
            for k in ("start_time", "end_time"):
                self.assertEqual(datetime.fromisoformat(e[k]).minute % 15, 0)
            if e["type"] != "DRIVING":
                self.assertEqual(e["location"], e["end_location"])
        self.assertEqual(j["events"][0]["location"]["name"], "New York, NY")
        self.assertEqual(self.rev.call_count, 1)
        for d in j["daily_logs"]:
            self.assertAlmostEqual(sum(d["totals"].values()), 24.0)

    def test_eastern_offset(self):
        """Test 21: home zone is the current location's zone; every time carries its offset."""
        j = self.post(body()).json()
        self.assertEqual(j["trip"]["timezone"], "America/New_York")
        self.assertEqual(j["trip"]["timezone_abbr"], "EDT")
        for e in j["events"]:
            self.assertTrue(e["start_time"].endswith("-04:00") and e["end_time"].endswith("-04:00"))
        self.assertEqual(j["events"][0]["location"]["utc_offset_minutes"], -240)

    def test_current_equals_pickup(self):
        """Test 25: zero-length first leg works end to end."""
        legs = [make_leg(0, NY, NY), make_leg(8 * 60, NY, CHI)]
        r = self.post(body(), legs)
        self.assertEqual(r.status_code, 200)
        j = r.json()
        self.assertEqual(j["route"]["pickup_index"], 1)
        self.assertIn("PICKUP", [e["type"] for e in j["events"]])

    def test_invalid_cycle(self):
        """Test 15: out-of-range or non-numeric cycle hours are rejected."""
        for bad in (-5, 72, "abc"):
            r = self.post(body(current_cycle_used=bad))
            self.assertEqual(r.status_code, 400, bad)
            e = r.json()["error"]
            self.assertEqual((e["code"], e["field"]), ("invalid_input", "current_cycle_used"))
        self.assertEqual(r.json()["error"]["message"], "Current cycle used must be between 0 and 70.")
        self.assertEqual(self.post(body(current_cycle_used=70)).status_code, 200)

    def test_non_finite_numbers_rejected(self):
        for bad in ("nan", "inf", "-inf"):
            r = self.post(body(current_cycle_used=bad))
            e = r.json()["error"]
            self.assertEqual((r.status_code, e["code"], e["field"]), (400, "invalid_input", "current_cycle_used"), bad)
            for k in ("lat", "lng"):
                r = self.post(body(pickup_location={"label": "Chicago", "lat": 41.8, "lng": -87.6, k: bad}))
                e = r.json()["error"]
                self.assertEqual((r.status_code, e["code"], e["field"]), (400, "invalid_input", "pickup_location"), (k, bad))

    def test_empty_label(self):
        """Test 16: empty label is 400 and names the field."""
        r = self.post(body(pickup_location={"label": ""}))
        self.assertEqual((r.status_code, r.json()["error"]["field"]), (400, "pickup_location"))

    def test_geocode_unresolvable_field(self):
        """Test 16: unresolvable location is 422 location_not_found and carries its field."""
        with patch("services.geocoding_service.geocode", side_effect=LocationNotFound("dropoff_location")):
            r = self.c.post(URL, body(dropoff_location={"label": "zzz"}), format="json")
        self.assertEqual((r.status_code, r.json()["error"]["code"]), (422, "location_not_found"))
        self.assertEqual(r.json()["error"]["field"], "dropoff_location")

    def test_routing_failures(self):
        """Test 17: timeout, unavailable and malformed ORS payload give structured 504/503."""
        for exc, status, code in [(RoutingTimeout(), 504, "routing_timeout"),
                                  (RoutingUnavailable(), 503, "routing_unavailable")]:
            with patch("services.routing_service.route", side_effect=exc):
                r = self.c.post(URL, body(), format="json")
            self.assertEqual((r.status_code, r.json()["error"]["code"]), (status, code))
            self.assertTrue(r.json()["error"]["message"])

        class Resp:
            status_code = 200
            def json(self):
                return {"nope": 1}
        with patch("requests.post", return_value=Resp()):
            r = self.c.post(URL, body(), format="json")
        self.assertEqual((r.status_code, r.json()["error"]["code"]), (503, "routing_unavailable"))
        with patch("requests.post", side_effect=requests.Timeout()):
            self.assertEqual(self.c.post(URL, body(), format="json").status_code, 504)

    def test_start_without_offset_is_home_terminal_time(self):
        r = self.post(body(start_datetime="2026-10-01T08:00:00"))
        self.assertEqual((r.status_code, r.json()["trip"]["start_time"]), (200, "2026-10-01T08:00:00-04:00"))

    def test_invalid_start_rejected(self):
        r = self.post(body(start_datetime="tomorrow"))
        self.assertEqual((r.status_code, r.json()["error"]["field"]), (400, "start_datetime"))

    def test_lat_lng_both_or_neither(self):
        r = self.post(body(pickup_location={"label": "Chicago", "lat": 41.8}))
        self.assertEqual((r.status_code, r.json()["error"]["field"]), (400, "pickup_location"))

    def test_coordinates_skip_geocoding(self):
        """Supplied lat/lng skip geocode for that field only."""
        data = body(pickup_location={"label": "Chicago, IL"})
        with patch("services.geocoding_service.geocode", return_value=Location("Chicago, IL", *CHI)) as geo:
            r = self.post(data)
        self.assertEqual(r.status_code, 200)
        geo.assert_called_once_with("Chicago, IL", field="pickup_location")

    def test_unexpected_error(self):
        with patch("services.routing_service.route", return_value=self.legs), \
                patch("services.hos_scheduler.plan_schedule", side_effect=RuntimeError("secret boom")), \
                self.assertLogs("trips.exceptions", "ERROR"):
            r = self.c.post(URL, body(), format="json")
        self.assertEqual((r.status_code, r.json()["error"]["code"]), (500, "unexpected"))
        self.assertNotIn("secret", r.content.decode())
        self.assertNotIn("Traceback", r.content.decode())
