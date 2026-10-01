import unittest

from common.enums import DUTY_STATUS_BY_EVENT, DutyStatus, EventType

E, D = EventType, DutyStatus


class EnumTests(unittest.TestCase):
    def test_mapping_per_spec_14(self):
        expected = {
            E.PRE_TRIP_INSPECTION: D.ON_DUTY_NOT_DRIVING,
            E.DRIVING: D.DRIVING,
            E.PICKUP: D.ON_DUTY_NOT_DRIVING,
            E.DROPOFF: D.ON_DUTY_NOT_DRIVING,
            E.FUEL: D.ON_DUTY_NOT_DRIVING,
            E.BREAK: D.OFF_DUTY,
            E.POST_TRIP_INSPECTION: D.ON_DUTY_NOT_DRIVING,
            E.CYCLE_RESTART: D.OFF_DUTY,
        }
        for event, status in expected.items():
            self.assertEqual(DUTY_STATUS_BY_EVENT[event], status)

    def test_daily_rest_is_sleeper_berth(self):
        """Test 24: DAILY_REST maps to SLEEPER_BERTH."""
        self.assertEqual(DUTY_STATUS_BY_EVENT[E.DAILY_REST], D.SLEEPER_BERTH)

    def test_complete_and_string_valued(self):
        self.assertEqual(set(DUTY_STATUS_BY_EVENT), set(EventType))
        self.assertEqual(EventType.DRIVING, "DRIVING")
        self.assertEqual(len(DutyStatus), 4)
