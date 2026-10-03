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
    def test_label_formats(self):
        """Towns read 'Town, ST'; a point on a highway reads 'Road near Nearest, ST' (FMCSA log guide, Remarks)."""
        self.assertEqual(g._label({"locality": "Omaha", "region_a": "NE", "name": "Omaha"}), "Omaha, NE")
        self.assertEqual(g._label({"name": "County Road 22", "street": "County Road 22", "county": "Logan County", "region_a": "CO"}),
                         "County Road 22 near Logan County, CO")
        self.assertEqual(g._label({"name": "I-80", "localadmin": "Paxton", "county": "Keith County", "region_a": "NE"}), "I-80 near Paxton, NE")
        self.assertEqual(g._label({"name": "Sterling", "localadmin": "Sterling", "region_a": "CO"}), "Sterling, CO")
        self.assertEqual(g._label({"label": "Somewhere", "name": "Somewhere"}), "Somewhere")

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
    def test_provider_reason_is_passed_on_without_the_key(self):
        """A refused geocode carries ORS's own words, and never the request URL (it holds the key)."""
        from common.errors import RoutingUnavailable
        bad = MagicMock(status_code=403)
        bad.raise_for_status.side_effect = requests.HTTPError("403 for url: https://x/?api_key=SECRET")
        bad.json.return_value = {"error": "Quota exceeded"}
        with patch("requests.get", return_value=bad):
            with self.assertRaises(RoutingUnavailable) as cm:
                g.geocode("Dallas, TX")
        self.assertEqual(str(cm.exception), "OpenRouteService answered: Quota exceeded (HTTP 403).")

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


class MalformedResponseTests(TestCase):
    def bad_responses(self):
        nonjson = MagicMock()
        nonjson.json.side_effect = ValueError()
        nonjson.raise_for_status.return_value = None
        return [nonjson, ok([{"properties": FEATURE["properties"]}]), ok([{"geometry": FEATURE["geometry"]}]),
                ok([{"geometry": {"coordinates": []}, "properties": {}}])]

    def test_forward_and_autocomplete_raise_routing_unavailable(self):
        from common.errors import RoutingUnavailable
        for resp in self.bad_responses():
            for call in (lambda: g.geocode("Omaha", field="pickup_location"), lambda: g.autocomplete("Oma")):
                with patch("requests.get", return_value=resp):
                    with self.assertRaises(RoutingUnavailable):
                        call()

    def test_reverse_malformed_falls_back(self):
        for resp in self.bad_responses()[::2] + self.bad_responses()[3:]:  # has properties -> a label, not malformed
            g._reverse_one.cache_clear()
            with patch("requests.get", return_value=resp):
                self.assertEqual(g.reverse_many([(10.0, 20.0)]), ["10.00, 20.00"])
