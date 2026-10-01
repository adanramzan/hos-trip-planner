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
