from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import requests
from django.conf import settings

from common.errors import LocationNotFound, RoutingTimeout, RoutingUnavailable
from common.types import Location

BASE = "https://api.openrouteservice.org/geocode"
TIMEOUT = 10  # seconds


def _label(props):
    city = props.get("locality") or props.get("name")
    if city and props.get("region_a"):
        return "%s, %s" % (city, props["region_a"])
    return props.get("label") or city or ""


def _location(feature):
    try:
        lng, lat = feature["geometry"]["coordinates"]
        return Location(_label(feature["properties"]), lat, lng)
    except (KeyError, TypeError, ValueError, AttributeError):  # malformed feature
        raise RoutingUnavailable()


def _get(path, params):
    params = dict(params, api_key=settings.ORS_API_KEY)
    r = requests.get(BASE + path, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    try:
        return r.json().get("features", [])
    except (ValueError, AttributeError):  # non-JSON or non-object body
        raise RoutingUnavailable()


def geocode(text, field=""):
    try:
        features = _get("/search", {"text": text, "boundary.country": "US", "size": 1})
    except requests.Timeout:
        raise RoutingTimeout()
    except requests.RequestException:
        raise RoutingUnavailable()
    if not features:
        raise LocationNotFound(field)
    return _location(features[0])


def autocomplete(q):
    features = _get("/autocomplete", {"text": q, "boundary.country": "US", "size": 5})
    return [_location(f) for f in features]


@lru_cache(maxsize=1024)
def _reverse_one(lat, lng):
    try:
        features = _get("/reverse", {"point.lat": lat, "point.lon": lng, "size": 1})
        return _label(features[0]["properties"]) or "%.2f, %.2f" % (lat, lng)
    except Exception:  # any failure falls back to a coordinate label
        return "%.2f, %.2f" % (lat, lng)


def reverse_many(points):
    rounded = [(round(lat, 2), round(lng, 2)) for lat, lng in points]
    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(lambda p: _reverse_one(*p), rounded))
