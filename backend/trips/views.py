from datetime import datetime, timezone

from rest_framework.decorators import api_view
from rest_framework.response import Response

from common.constants import MAX_CYCLE_HOURS
from common.enums import DutyStatus, EventType
from common.types import Location
from services import eld_service, geocoding_service, hos_scheduler, route_position, routing_service, timezone_service
from services.geocoding_service import autocomplete

from .serializers import PlanRequestSerializer

FIELDS = ("current_location", "pickup_location", "dropoff_location")
EPS = 1e-6


@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})


@api_view(["GET"])
def geocode_autocomplete(request):
    q = request.query_params.get("q", "").strip()
    if len(q) < 3:
        return Response({"suggestions": []})
    try:
        locs = autocomplete(q)
    except Exception:  # autocomplete must never error the form
        return Response({"suggestions": []})
    return Response({"suggestions": [{"label": l.name, "lat": l.lat, "lng": l.lng} for l in locs]})


def _resolve(data):
    out = []
    for f in FIELDS:
        d = data[f]
        out.append(Location(d["label"], d["lat"], d["lng"]) if "lat" in d else geocoding_service.geocode(d["label"], field=f))
    return out


def _assemble(data):
    """Glue: geocode, route, schedule, name stops, build the response from the events only."""
    locs = _resolve(data)
    legs = routing_service.route(locs)
    home_tz = timezone_service.home_timezone(locs[0].lat, locs[0].lng)
    start = data.get("start_datetime") or datetime.now(timezone.utc)
    start = start.replace(tzinfo=home_tz) if start.utcoffset() is None else start.astimezone(home_tz)
    cycle_start = data["current_cycle_used"]
    events = hos_scheduler.plan_schedule(legs, cycle_start, start)

    def point(leg_index, minutes):
        """(lat, lng, known_name_or_None) at `minutes` on a leg; leg endpoints use the stop labels."""
        i = leg_index or 0
        leg = legs[i]
        if minutes <= EPS:
            known = locs[i]
        elif minutes >= leg.duration_minutes - EPS:
            known = locs[i + 1]
        else:
            lat, lng = route_position.position_at(leg, minutes)
            return lat, lng, None
        return known.lat, known.lng, known.name

    pts = []  # per event: (start point, end point)
    for e in events:
        a = point(e.leg_index, e.leg_minutes_start)
        pts.append((a, point(e.leg_index, e.leg_minutes_end) if e.type == EventType.DRIVING else a))
    key = lambda p: (round(p[0], 2), round(p[1], 2))
    unnamed = list({key(p): p for pair in pts for p in pair if p[2] is None}.values())
    names = dict(zip(map(key, unnamed), geocoding_service.reverse_many([(p[0], p[1]) for p in unnamed]))) if unnamed else {}
    zones = {}

    def loc_json(p, at):
        k = key(p)
        tz = zones.get(k) or zones.setdefault(k, timezone_service.home_timezone(p[0], p[1]))
        return {"name": p[2] or names[k], "lat": p[0], "lng": p[1], "utc_offset_minutes": int(at.astimezone(tz).utcoffset().total_seconds() // 60)}

    out = []
    for e, (a, b) in zip(events, pts):
        la, lb = loc_json(a, e.start), loc_json(b, e.end)
        e.location, e.end_location = Location(la["name"], la["lat"], la["lng"]), Location(lb["name"], lb["lat"], lb["lng"])
        out.append({"type": e.type.value, "duty_status": e.duty_status.value, "start_time": e.start.astimezone(home_tz).isoformat(),
                    "end_time": e.end.astimezone(home_tz).isoformat(), "duration_minutes": round((e.end - e.start).total_seconds() / 60),
                    "location": la, "end_location": lb, "distance_miles": round(e.distance_miles, 1),
                    "cumulative_miles": round(e.cumulative_miles, 1), "reason": e.reason})
    logs = eld_service.generate_daily_logs(events, home_tz)

    hours = lambda e: (e.end - e.start).total_seconds() / 3600
    count = lambda t: sum(e.type == t for e in events)
    used = cycle_start
    for e in events:
        if e.type == EventType.CYCLE_RESTART:
            used = 0
        elif e.duty_status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY_NOT_DRIVING):
            used += hours(e)
    first, last = events[0], events[-1]
    return {
        "trip": {
            "distance_miles": round(last.cumulative_miles, 1),
            "driving_hours": round(sum(hours(e) for e in events if e.type == EventType.DRIVING), 2),
            "elapsed_hours": round((last.end - first.start).total_seconds() / 3600, 2),
            "days": len(logs), "fuel_stops": count(EventType.FUEL), "breaks": count(EventType.BREAK),
            "rest_stops": count(EventType.DAILY_REST), "restarts": count(EventType.CYCLE_RESTART),
            "cycle_used_start": cycle_start, "cycle_used_end": round(used, 2), "cycle_remaining": round(max(0, MAX_CYCLE_HOURS - used), 2),
            "start_time": first.start.astimezone(home_tz).isoformat(), "end_time": last.end.astimezone(home_tz).isoformat(),
            "timezone": home_tz.key, "timezone_abbr": start.tzname(),
        },
        "route": {
            "geometry": [list(p) for leg in legs for p in leg.geometry], "pickup_index": len(legs[0].geometry),
            **{f: {"label": l.name, "lat": l.lat, "lng": l.lng} for f, l in zip(FIELDS, locs)},
        },
        "events": out, "daily_logs": logs, "log_details": data.get("log_details", {}),
    }


@api_view(["POST"])
def plan_trip(request):
    s = PlanRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    return Response(_assemble(s.validated_data))
