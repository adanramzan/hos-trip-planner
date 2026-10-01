from unittest.mock import patch

from django.test import SimpleTestCase

from common.types import Location


class ApiBasicTests(SimpleTestCase):
    def test_health(self):
        r = self.client.get("/api/health")
        self.assertEqual((r.status_code, r.json()), (200, {"status": "ok"}))

    def test_autocomplete_shape(self):
        with patch("trips.views.autocomplete", return_value=[Location("Omaha, NE", 41.26, -95.93)]):
            r = self.client.get("/api/geocode/autocomplete?q=Omaha")
        self.assertEqual(r.json(), {"suggestions": [{"label": "Omaha, NE", "lat": 41.26, "lng": -95.93}]})

    def test_autocomplete_short_query_skips_ors(self):
        with patch("trips.views.autocomplete") as ac:
            r = self.client.get("/api/geocode/autocomplete?q=Om")
        ac.assert_not_called()
        self.assertEqual(r.json(), {"suggestions": []})

    def test_autocomplete_ors_failure_gives_empty(self):
        with patch("trips.views.autocomplete", side_effect=Exception("boom")):
            r = self.client.get("/api/geocode/autocomplete?q=Omaha")
        self.assertEqual(r.json(), {"suggestions": []})

    def test_reverse_shape(self):
        with patch("trips.views.geocoding_service.reverse_many", return_value=["Omaha, NE"]):
            r = self.client.get("/api/geocode/reverse?lat=41.26&lng=-95.93")
        self.assertEqual(r.json(), {"label": "Omaha, NE", "lat": 41.26, "lng": -95.93})

    def test_reverse_bad_input_is_400(self):
        for q in ("", "?lat=41", "?lat=x&lng=1", "?lat=91&lng=0", "?lat=0&lng=181", "?lat=nan&lng=0"):
            r = self.client.get("/api/geocode/reverse" + q)
            self.assertEqual((r.status_code, r.json()["error"]["code"]), (400, "invalid_input"), q)
