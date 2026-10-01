from unittest import TestCase
from unittest.mock import MagicMock, patch

import requests

from common.errors import LocationNotFound
from services import geocoding_service as g

FEATURE = {"geometry": {"coordinates": [-95.93, 41.26]},
           "properties": {"locality": "Omaha", "region_a": "NE", "label": "Omaha, NE, USA"}}


def ok(features):
    r = MagicMock()
    r.json.return_value = {"features": features}
    r.raise_for_status.return_value = None
    return r


class GeocodeTests(TestCase):
    def test_geocode_success(self):
        """Test 16: geocode returns a Location labelled City, ST."""
        with patch("requests.get", return_value=ok([FEATURE])) as get:
            loc = g.geocode("Omaha")
        self.assertEqual((loc.name, loc.lat, loc.lng), ("Omaha, NE", 41.26, -95.93))
        self.assertEqual(get.call_args[1]["params"]["boundary.country"], "US")

    def test_geocode_not_found(self):
        """Test 16: no features raises LocationNotFound with the field."""
        with patch("requests.get", return_value=ok([])):
            with self.assertRaises(LocationNotFound) as cm:
                g.geocode("zzzz", field="pickup_location")
        self.assertEqual(cm.exception.field, "pickup_location")

    def test_autocomplete(self):
        with patch("requests.get", return_value=ok([FEATURE])):
            self.assertEqual(g.autocomplete("Oma")[0].name, "Omaha, NE")

    def test_reverse_many_fallback_and_order(self):
        g._reverse_one.cache_clear()
        def fake(url, **kw):
            if kw["params"]["point.lat"] == 10.0:
                raise requests.ConnectionError()
            return ok([FEATURE])
        with patch("requests.get", side_effect=fake):
            names = g.reverse_many([(41.261, -95.931), (10.0, 20.0)])
        self.assertEqual(names, ["Omaha, NE", "10.00, 20.00"])


class GeocodeErrorTests(TestCase):
    def test_timeout_and_failures(self):
        """Test 17: geocode maps timeout, other request errors and non-2xx to routing errors."""
        from common.errors import RoutingTimeout, RoutingUnavailable
        bad = MagicMock()
        bad.raise_for_status.side_effect = requests.HTTPError()
        for kw, exc in [({"side_effect": requests.Timeout()}, RoutingTimeout),
                        ({"side_effect": requests.ConnectionError()}, RoutingUnavailable),
                        ({"return_value": bad}, RoutingUnavailable)]:
            with patch("requests.get", **kw):
                with self.assertRaises(exc):
                    g.geocode("Omaha", field="pickup_location")
