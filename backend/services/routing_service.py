import math

import requests
from django.conf import settings

from common.constants import METERS_PER_MILE, ROUTING_PROFILE
from common.errors import NoRoute, RoutingTimeout, RoutingUnavailable
from common.types import Leg, Step

URL = "https://api.openrouteservice.org/v2/directions/%s/geojson" % ROUTING_PROFILE
TIMEOUT = 20  # seconds
SAME_POINT_METERS = 50


def _meters_between(a, b):
    # equirectangular approximation; fine at 50 m
    dy = (a.lat - b.lat) * 111320
    dx = (a.lng - b.lng) * 111320 * math.cos(math.radians(a.lat))
    return math.hypot(dx, dy)


def _leg(a, b):
    if _meters_between(a, b) < SAME_POINT_METERS:
        return Leg(0.0, 0.0, [], [(a.lat, a.lng)])
    try:
        r = requests.post(
            URL,
            json={"coordinates": [[a.lng, a.lat], [b.lng, b.lat]]},
            headers={"Authorization": settings.ORS_API_KEY},
            timeout=TIMEOUT,
        )
    except requests.Timeout:
        raise RoutingTimeout()
    except requests.RequestException:
        raise RoutingUnavailable()
    if r.status_code in (401, 403, 429) or r.status_code >= 500:  # 401/403 = bad key
        raise RoutingUnavailable()
    if r.status_code >= 400:
        raise NoRoute()
    try:
        features = r.json()["features"]
        if not features:
            raise NoRoute()
        f = features[0]
        seg = f["properties"]["segments"][0]
        steps = [Step(s["distance"] / METERS_PER_MILE, s["duration"] / 60.0, tuple(s["way_points"]))
                 for s in seg["steps"]]
        geometry = [(lat, lng) for lng, lat in f["geometry"]["coordinates"]]
        return Leg(seg["distance"] / METERS_PER_MILE, seg["duration"] / 60.0, steps, geometry)
    except (KeyError, IndexError, TypeError, ValueError):
        raise RoutingUnavailable()


def route(locations):
    return [_leg(a, b) for a, b in zip(locations, locations[1:])]
