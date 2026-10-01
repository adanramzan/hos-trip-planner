"""Time-to-position mapping along a route leg using per-step data (spec section 25). Pure math."""
from math import asin, cos, radians, sin, sqrt

from common.constants import EARTH_RADIUS_MILES


def _haversine(a, b):
    (la1, lo1), (la2, lo2) = a, b
    h = sin(radians(la2 - la1) / 2) ** 2 + cos(radians(la1)) * cos(radians(la2)) * sin(radians(lo2 - lo1) / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * asin(sqrt(h))


def _locate(leg, minutes):
    """Return (step, fraction_into_step, miles_before_step) for `minutes` of driving."""
    elapsed = miles = 0.0
    for step in leg.steps:
        if minutes <= elapsed + step.duration_minutes:
            f = (minutes - elapsed) / step.duration_minutes if step.duration_minutes else 0.0
            return step, max(0.0, f), miles
        elapsed += step.duration_minutes
        miles += step.distance_miles
    return (leg.steps[-1], 1.0, miles - leg.steps[-1].distance_miles) if leg.steps else (None, 0.0, 0.0)


def miles_at(leg, minutes):
    step, f, before = _locate(leg, minutes)
    if step is None:
        return 0.0
    return min(max(before + f * step.distance_miles, 0.0), leg.distance_miles)


def minutes_at(leg, miles):
    elapsed = covered = 0.0
    for step in leg.steps:
        if miles <= covered + step.distance_miles:
            f = (miles - covered) / step.distance_miles if step.distance_miles else 0.0
            return min(max(elapsed + max(0.0, f) * step.duration_minutes, 0.0), leg.duration_minutes)
        elapsed += step.duration_minutes
        covered += step.distance_miles
    return min(max(elapsed, 0.0), leg.duration_minutes)


def position_at(leg, minutes):
    step, f, _ = _locate(leg, minutes)
    if step is None:
        return leg.geometry[0]
    start, end = step.way_points
    pts = leg.geometry[start:end + 1]
    if len(pts) < 2:
        return pts[0] if pts else leg.geometry[-1]
    gaps = [_haversine(a, b) for a, b in zip(pts, pts[1:])]
    target = f * sum(gaps)
    for (a, b), gap in zip(zip(pts, pts[1:]), gaps):
        if target <= gap:
            g = target / gap if gap else 0.0
            return (a[0] + g * (b[0] - a[0]), a[1] + g * (b[1] - a[1]))
        target -= gap
    return pts[-1]
