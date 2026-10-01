from unittest import TestCase
from unittest.mock import MagicMock, patch

import requests

from common.errors import NoRoute, RoutingTimeout, RoutingUnavailable
from common.types import Location
from services import routing_service as r

A = Location("A", 41.0, -95.0)
B = Location("B", 41.5, -95.5)
PAYLOAD = {"features": [{
    "geometry": {"coordinates": [[-95.0, 41.0], [-95.2, 41.2], [-95.5, 41.5]]},
    "properties": {"segments": [{"distance": 160934.4, "duration": 3600,
        "steps": [{"distance": 80467.2, "duration": 1800, "way_points": [0, 1]},
                  {"distance": 80467.2, "duration": 1800, "way_points": [1, 2]}]}]}}]}


def resp(status=200, payload=PAYLOAD):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = payload
    return m


class RouteTests(TestCase):
    def test_success_conversion(self):
        """Test 17: meters/seconds become miles/minutes, geometry is (lat, lng)."""
        with patch("requests.post", return_value=resp()):
            (leg,) = r.route([A, B])
        self.assertAlmostEqual(leg.distance_miles, 100.0, places=2)
        self.assertAlmostEqual(leg.duration_minutes, 60.0)
        self.assertEqual(leg.geometry[1], (41.2, -95.2))
        self.assertEqual(leg.steps[1].way_points, (1, 2))
        self.assertAlmostEqual(leg.steps[0].distance_miles, 50.0, places=2)

    def test_timeout(self):
        """Test 17"""
        with patch("requests.post", side_effect=requests.Timeout()):
            with self.assertRaises(RoutingTimeout):
                r.route([A, B])

    def test_503(self):
        """Test 17"""
        with patch("requests.post", return_value=resp(503, {})):
            with self.assertRaises(RoutingUnavailable):
                r.route([A, B])

    def test_connection_error(self):
        with patch("requests.post", side_effect=requests.ConnectionError()):
            with self.assertRaises(RoutingUnavailable):
                r.route([A, B])

    def test_malformed_payload(self):
        """Test 17"""
        with patch("requests.post", return_value=resp(200, {"features": [{}]})):
            with self.assertRaises(RoutingUnavailable):
                r.route([A, B])

    def test_4xx_is_no_route(self):
        with patch("requests.post", return_value=resp(404, {"error": "x"})):
            with self.assertRaises(NoRoute):
                r.route([A, B])

    def test_no_route_carries_reason(self):
        cases = [({"code": 2010, "message": "Could not find routable point within a radius of 350.0 meters of specified coordinate 1: -95.5 41.5."}, "B is not close enough to a road"),
                 ({"code": 2004, "message": "too long"}, "longer than the routing service allows"),
                 ({"code": 2009, "message": "not found"}, "no road a truck can drive connects them")]
        for err, text in cases:
            with patch("requests.post", return_value=resp(404, {"error": err})):
                with self.assertRaises(NoRoute) as cm:
                    r.route([A, B])
            self.assertIn("No truck route from A to B", str(cm.exception))
            self.assertIn(text, str(cm.exception))

    def test_no_features_is_no_route(self):
        with patch("requests.post", return_value=resp(200, {"features": []})):
            with self.assertRaises(NoRoute):
                r.route([A, B])

    def test_same_point_makes_no_http_call(self):
        """Test 25: zero-length leg without calling ORS."""
        with patch("requests.post") as post:
            (leg,) = r.route([A, Location("A2", 41.0001, -95.0)])
        post.assert_not_called()
        self.assertEqual((leg.distance_miles, leg.duration_minutes, leg.steps), (0, 0, []))
        self.assertEqual(len(leg.geometry), 1)


class AuthTests(TestCase):
    def test_bad_key_is_unavailable(self):
        """Test 17: ORS 401/403 (bad or missing key) is a service problem, not 'no route'."""
        for status in (401, 403):
            with patch("requests.post", return_value=resp(status)):
                with self.assertRaises(RoutingUnavailable):
                    r.route([A, B])
