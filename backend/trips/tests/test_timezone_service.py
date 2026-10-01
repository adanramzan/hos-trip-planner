from unittest import TestCase
from unittest.mock import MagicMock, patch

from services import timezone_service as t


class TimezoneTests(TestCase):
    def test_new_york(self):
        """Test 21: NYC coordinates give America/New_York."""
        self.assertEqual(t.home_timezone(40.7128, -74.0060).key, "America/New_York")

    def test_none_falls_back_to_utc(self):
        with patch.object(t, "_tf", MagicMock(timezone_at=MagicMock(return_value=None))):
            self.assertEqual(t.home_timezone(0, 0).key, "UTC")
