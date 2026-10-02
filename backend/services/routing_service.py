import math

import requests
from django.conf import settings

from common.constants import METERS_PER_MILE, ROUTING_PROFILE
from common.errors import NoRoute, RoutingTimeout, RoutingUnavailable, provider_reason
from common.types import Leg, Step

URL = "https://api.openrouteservice.org/v2/directions/%s/geojson" % ROUTING_PROFILE
TIMEOUT = 20  # seconds
SAME_POINT_METERS = 50
SNAP_RADIUS_METERS = 5000  # ORS default is 350 m; a geocoded city centre can sit further from a truck road


def _meters_between(a, b):
    # equirectangular approximation; fine at 50 m
    dy = (a.lat - b.lat) * 111320
    dx = (a.lng - b.lng) * 111320 * math.cos(math.radians(a.lat))
    return math.hypot(dx, dy)


def _reason(r, a, b):
    """Plain-language reason from an ORS error body ({"error": {"code", "message"}})."""
    try:
        err = r.json().get("error") or {}
        code, msg = (err.get("code"), err.get("message", "")) if isinstance(err, dict) else (None, "")
    except ValueError:
        code, msg = None, ""
    if code == 2010:  # no routable point near a coordinate; ORS names it "coordinate 0" or "coordinate 1"
        why = "%s is not close enough to a road a truck can use. Pick a point nearer a road." % (b.name if "coordinate 1" in msg else a.name)
    elif code == 2004:
        why = "that leg is longer than the routing service allows (about 3,700 miles)."
    else:
        why = "no road a truck can drive connects them (for example, across open water)."
    return "No truck route from %s to %s: %s" % (a.name, b.name, why)


def _leg(a, b):
    if _meters_between(a, b) < SAME_POINT_METERS:
        return Leg(0.0, 0.0, [], [(a.lat, a.lng)])
    try:
        r = requests.post(
            URL,
            json={"coordinates": [[a.lng, a.lat], [b.lng, b.lat]], "radiuses": [SNAP_RADIUS_METERS] * 2},
            headers={"Authorization": settings.ORS_API_KEY},
            timeout=TIMEOUT,
        )
    except requests.Timeout:
        raise RoutingTimeout()
    except requests.RequestException:
        raise RoutingUnavailable()
    if r.status_code in (401, 403, 429) or r.status_code >= 500:  # 401/403 = bad key
        raise RoutingUnavailable(provider_reason(r))
    if r.status_code >= 400:
        raise NoRoute(_reason(r, a, b))
    try:
        features = r.json()["features"]
        if not features:
            raise NoRoute(_reason(r, a, b))
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
