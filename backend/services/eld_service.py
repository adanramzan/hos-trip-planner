"""Turn the canonical TripEvent[] timeline into one FMCSA-style daily log per home-terminal calendar day."""
from datetime import datetime, time, timedelta
from typing import List
from zoneinfo import ZoneInfo

from common.constants import MINUTES_PER_DAY, MINUTES_PER_HOUR
from common.enums import DutyStatus, EventType
from common.types import TripEvent

LABELS = {
    EventType.PRE_TRIP_INSPECTION: "Pre-trip inspection",
    EventType.DRIVING: "Driving",
    EventType.PICKUP: "Pickup",
    EventType.DROPOFF: "Dropoff",
    EventType.FUEL: "Fuel",
    EventType.BREAK: "30-minute break",
    EventType.POST_TRIP_INSPECTION: "Post-trip inspection",
    EventType.DAILY_REST: "10-hour rest",
    EventType.CYCLE_RESTART: "34-hour restart",
}


def _wall(dt: datetime, tz: ZoneInfo) -> datetime:
    # Naive local wall clock: every day is exactly 1440 minutes (DST days are a documented limitation).
    return dt.astimezone(tz).replace(tzinfo=None)


def generate_daily_logs(events: List[TripEvent], home_tz: ZoneInfo) -> List[dict]:
    days = {}  # date -> {"pieces": [(status, s, e, miles)], "remarks": [...], "locs": [...]}
    for ev in events:
        start, end = _wall(ev.start, home_tz), _wall(ev.end, home_tz)
        total_min = (end - start).total_seconds() / MINUTES_PER_HOUR
        name = ev.location.name if ev.location and ev.location.name else ""
        cur = start
        while cur < end:
            midnight = datetime.combine(cur.date() + timedelta(days=1), time())
            nxt = min(end, midnight)
            s = int((cur - datetime.combine(cur.date(), time())).total_seconds() // MINUTES_PER_HOUR)
            e = s + int((nxt - cur).total_seconds() // MINUTES_PER_HOUR)
            d = days.setdefault(cur.date(), {"pieces": [], "remarks": [], "locs": []})
            miles = ev.distance_miles * (e - s) / total_min if ev.duty_status == DutyStatus.DRIVING else 0.0
            d["pieces"].append((ev.duty_status.value, s, e, miles))
            if cur == start:
                d["remarks"].append({"minute": s, "location": name, "label": LABELS[ev.type]})
            if name:
                d["locs"].append(name)
            cur = nxt

    logs = []
    first, last = min(days), max(days)
    for date in sorted(days):  # events are contiguous, so every day in [first, last] exists
        d = days[date]
        segs, pos = [], 0
        pieces = d["pieces"] + [(DutyStatus.OFF_DUTY.value, MINUTES_PER_DAY, MINUTES_PER_DAY, 0.0)]
        for status, s, e, _ in pieces:
            if s > pos:  # leading (day 1) / trailing (last day) fill
                segs.append({"status": DutyStatus.OFF_DUTY.value, "start_minute": pos, "end_minute": s})
            if e > s:
                segs.append({"status": status, "start_minute": s, "end_minute": e})
            pos = max(pos, e)
        merged = []
        for seg in segs:
            if merged and merged[-1]["status"] == seg["status"] and merged[-1]["end_minute"] == seg["start_minute"]:
                merged[-1]["end_minute"] = seg["end_minute"]
            else:
                merged.append(seg)
        covered = sum(s["end_minute"] - s["start_minute"] for s in merged)
        assert covered == MINUTES_PER_DAY and merged[0]["start_minute"] == 0, \
            "daily log %s covers %s minutes, expected %s" % (date, covered, MINUTES_PER_DAY)
        totals = {s.value: 0.0 for s in DutyStatus}
        for s in merged:
            totals[s["status"]] += (s["end_minute"] - s["start_minute"]) / MINUTES_PER_HOUR
        logs.append({
            "date": date.isoformat(),
            "timezone": home_tz.key,
            "total_miles": round(sum(p[3] for p in d["pieces"]), 1),
            "from_location": d["locs"][0] if d["locs"] else "",
            "to_location": d["locs"][-1] if d["locs"] else "",
            "segments": merged,
            "totals": totals,
            "remarks": d["remarks"],
        })
    return logs
