"""FMCSA Hours-of-Service scheduler (spec sections 5, 15-24). Pure Python: no Django, no I/O.

Two clocks: logged minutes sit on the 15-minute grid and drive every HOS counter; real (unrounded)
driving minutes along a leg drive position and miles. They differ only at waypoint arrivals, where
the logged segment is the real remainder rounded up.
"""
import math
from datetime import datetime, timedelta, timezone
from typing import List

from common.constants import (
    BREAK_AFTER_DRIVING_HOURS, BREAK_DURATION_MINUTES, CYCLE_RESTART_HOURS, DROPOFF_DURATION_MINUTES,
    FUEL_DURATION_MINUTES, FUEL_MERGE_THRESHOLD_MILES, FUEL_TRIGGER_MILES, MAX_CYCLE_HOURS,
    MAX_DRIVING_HOURS, MAX_DUTY_WINDOW_HOURS, MINUTES_PER_HOUR, PICKUP_DURATION_MINUTES,
    POST_TRIP_INSPECTION_MINUTES, PRE_TRIP_INSPECTION_MINUTES, REQUIRED_REST_HOURS, TIME_GRID_MINUTES,
)
from common.enums import DUTY_STATUS_BY_EVENT, DutyStatus, EventType
from common.types import Leg, TripEvent
from services.route_position import miles_at, minutes_at

E = EventType
GRID = TIME_GRID_MINUTES
EPS = 1e-6  # float slack for minute comparisons and rounding
ON_DUTY = (DutyStatus.DRIVING, DutyStatus.ON_DUTY_NOT_DRIVING)


def _floor(m):
    return math.floor((m + EPS) / GRID) * GRID


def _ceil(m):
    return math.ceil((m - EPS) / GRID) * GRID


def round_up_to_grid(t: datetime) -> datetime:
    base = t.replace(second=0, microsecond=0)
    if base != t:
        base += timedelta(minutes=1)
    return base + timedelta(minutes=(-base.minute) % GRID)


def _plus(t, minutes):
    """Add real elapsed minutes (via UTC, so DST nights stay correct), back in t's zone."""
    return (t.astimezone(timezone.utc) + timedelta(minutes=minutes)).astimezone(t.tzinfo)


class _State:
    def __init__(self, legs, cycle_used_hours, start):
        self.legs = legs
        self.t = round_up_to_grid(start)
        self.events: List[TripEvent] = []
        self.daily = 0.0  # logged driving minutes this duty period
        self.since_break = 0.0  # logged driving minutes since a >= 30 min non-driving period
        self.nondriving = 0.0  # current contiguous non-driving minutes
        self.window_start = None  # None = off duty; set by the first work event (pre-trip)
        self.cycle = cycle_used_hours * MINUTES_PER_HOUR
        self.miles_since_fuel = 0.0
        self.cum_miles = 0.0
        self.leg = 0
        self.leg_min = 0.0  # real driving minutes elapsed on the current leg

    def add(self, type_, minutes, reason, real=0.0):
        """Append one event and update every counter (the only place state changes)."""
        status = DUTY_STATUS_BY_EVENT[type_]
        start, leg_start = self.t, self.leg_min
        distance = 0.0
        if status in ON_DUTY:
            self.cycle += minutes
            if self.window_start is None:
                self.window_start = start
        if type_ == E.DRIVING:
            leg = self.legs[self.leg]
            end_min = leg.duration_minutes if real >= leg.duration_minutes - leg_start - EPS else leg_start + real
            distance = miles_at(leg, end_min) - miles_at(leg, leg_start)
            self.leg_min = end_min
            self.daily += minutes
            self.since_break += minutes
            self.nondriving = 0
            self.miles_since_fuel += distance
            self.cum_miles += distance
        else:
            self.nondriving += minutes
            if self.nondriving >= BREAK_DURATION_MINUTES:
                self.since_break = 0
        if type_ == E.FUEL:
            self.miles_since_fuel = 0
        if type_ in (E.DAILY_REST, E.CYCLE_RESTART):
            self.daily = self.since_break = 0
            self.window_start = None
        if type_ == E.CYCLE_RESTART:
            self.cycle = 0
        self.t = _plus(start, minutes)
        self.events.append(TripEvent(
            type=type_, duty_status=status, start=start, end=self.t, leg_index=self.leg,
            leg_minutes_start=leg_start, leg_minutes_end=self.leg_min, distance_miles=distance,
            cumulative_miles=self.cum_miles, reason=reason,
        ))

    def on_duty(self):
        if self.window_start is None:
            self.add(E.PRE_TRIP_INSPECTION, PRE_TRIP_INSPECTION_MINUTES, "Pre-trip inspection starts the duty period")

    def rest(self, type_, reason):
        if self.window_start is not None:
            self.add(E.POST_TRIP_INSPECTION, POST_TRIP_INSPECTION_MINUTES, "Post-trip inspection ends the duty period")
        hours = CYCLE_RESTART_HOURS if type_ == E.CYCLE_RESTART else REQUIRED_REST_HOURS
        self.add(type_, hours * MINUTES_PER_HOUR, reason)

    def cycle_left(self):
        return _floor(MAX_CYCLE_HOURS * MINUTES_PER_HOUR - self.cycle)

    def drive_leg(self, to):
        leg = self.legs[self.leg]
        while leg.duration_minutes - self.leg_min > EPS:
            # Driving-only checks (section 19), resolved one at a time, then recomputed.
            window_left = MAX_DUTY_WINDOW_HOURS * MINUTES_PER_HOUR - (
                (self.t.timestamp() - self.window_start.timestamp()) / 60 if self.window_start else 0)
            daily_left = MAX_DRIVING_HOURS * MINUTES_PER_HOUR - self.daily
            if self.cycle_left() <= 0:
                self.rest(E.CYCLE_RESTART, "70-hour cycle limit reached: 34-hour restart")
                continue
            if daily_left <= 0 or window_left <= 0:
                why = "11-hour driving limit reached" if daily_left <= 0 else "14-hour duty window reached"
                self.rest(E.DAILY_REST, why)
                continue
            self.on_duty()
            break_left = BREAK_AFTER_DRIVING_HOURS * MINUTES_PER_HOUR - self.since_break
            if break_left <= 0:
                if self.miles_since_fuel >= FUEL_MERGE_THRESHOLD_MILES:
                    self.add(E.FUEL, FUEL_DURATION_MINUTES, "Fuel stop doubles as the 30-minute break after 8 hours of driving")
                else:
                    self.add(E.BREAK, BREAK_DURATION_MINUTES, "30-minute break after 8 hours of driving")
                continue
            remaining = leg.duration_minutes - self.leg_min
            fuel_at = miles_at(leg, self.leg_min) + FUEL_TRIGGER_MILES - self.miles_since_fuel
            fuel_real = minutes_at(leg, fuel_at) - self.leg_min if fuel_at < leg.distance_miles else math.inf
            fuel_cut = _floor(fuel_real) if fuel_real < math.inf else math.inf  # rounded down: 1,000 mi never exceeded
            if fuel_cut <= 0:
                self.add(E.FUEL, FUEL_DURATION_MINUTES, "Fuel required before the 1,000-mile limit")
                continue
            allowed = min(self.cycle_left(), daily_left, window_left, break_left)  # all on the grid
            if fuel_real < remaining and fuel_cut <= allowed:
                self.add(E.DRIVING, fuel_cut, f"Drive toward {to}", real=fuel_cut)
            elif _ceil(remaining) <= allowed:
                self.add(E.DRIVING, _ceil(remaining), f"Drive to {to}", real=remaining)
            else:  # cut by an HOS limit; ceil(remaining) > allowed implies remaining > allowed
                self.add(E.DRIVING, allowed, f"Drive toward {to}", real=allowed)


def plan_schedule(legs: List[Leg], cycle_used_hours: float, start: datetime) -> List[TripEvent]:
    """legs = [current->pickup, pickup->dropoff]; start is tz-aware in the home terminal zone."""
    s = _State(legs, cycle_used_hours, start)
    if s.cycle_left() <= 0 and any(l.duration_minutes > EPS for l in legs):
        s.rest(E.CYCLE_RESTART, "Starting with a full 70-hour cycle: 34-hour restart")
    s.on_duty()
    s.drive_leg("pickup")
    s.on_duty()
    s.add(E.PICKUP, PICKUP_DURATION_MINUTES, "Loading at pickup")
    s.leg, s.leg_min = 1, 0.0
    s.drive_leg("dropoff")
    s.on_duty()
    s.add(E.DROPOFF, DROPOFF_DURATION_MINUTES, "Unloading at dropoff")
    s.add(E.POST_TRIP_INSPECTION, POST_TRIP_INSPECTION_MINUTES, "Post-trip inspection ends the trip")
    return s.events
