import unittest

from common.types import Leg, Step
from services.route_position import miles_at, minutes_at, position_at

# Geometry along the equator; 1 degree of longitude ~ 69.09 mi.
# Step A: points 0..1 (lng 0 -> 1), step B: points 1..3 (lng 1 -> 2 -> 3).
GEOM = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0), (0.0, 3.0)]
LEG = Leg(
    distance_miles=120,
    duration_minutes=150,
    steps=[Step(100, 90, (0, 1)), Step(20, 60, (1, 3))],
    geometry=GEOM,
)


class RoutePositionTests(unittest.TestCase):
    def test_26_time_based_interpolation(self):
        """Test 26: at 2h the stop is inside step B, ~10 mi in (not 2/2.5 of distance)."""
        self.assertAlmostEqual(miles_at(LEG, 120), 110)
        self.assertNotAlmostEqual(miles_at(LEG, 120), 120 * 120 / 150, places=0)
        lat, lng = position_at(LEG, 120)
        self.assertAlmostEqual(lat, 0.0, places=6)
        self.assertAlmostEqual(lng, 2.0, places=3)  # halfway along step B slice (lng 1 -> 3)

    def test_round_trip(self):
        for t in (0, 30, 90, 120, 149, 150):
            self.assertAlmostEqual(minutes_at(LEG, miles_at(LEG, t)), t)

    def test_clamped(self):
        self.assertEqual(miles_at(LEG, -5), 0)
        self.assertEqual(miles_at(LEG, 999), 120)
        self.assertEqual(minutes_at(LEG, 999), 150)
        self.assertEqual(minutes_at(LEG, -1), 0)

    def test_zero_length_leg(self):
        leg = Leg(0, 0, [], [(10.0, 20.0)])
        self.assertEqual(miles_at(leg, 30), 0)
        self.assertEqual(minutes_at(leg, 5), 0)
        self.assertEqual(position_at(leg, 30), (10.0, 20.0))

    def test_zero_duration_step(self):
        leg = Leg(10, 60, [Step(0, 0, (0, 0)), Step(10, 60, (0, 1))], [(0.0, 0.0), (0.0, 1.0)])
        self.assertAlmostEqual(miles_at(leg, 30), 5)
        self.assertAlmostEqual(position_at(leg, 30)[1], 0.5, places=3)
