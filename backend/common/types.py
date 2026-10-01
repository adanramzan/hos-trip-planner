from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Tuple

from common.enums import DutyStatus, EventType


@dataclass
class Location:
    name: str
    lat: float
    lng: float


@dataclass
class Step:
    distance_miles: float
    duration_minutes: float
    way_points: Tuple[int, int]  # (start_idx, end_idx) into Leg.geometry


@dataclass
class Leg:
    distance_miles: float
    duration_minutes: float
    steps: List[Step]
    geometry: List[Tuple[float, float]]  # (lat, lng)


@dataclass
class TripEvent:
    type: EventType
    duty_status: DutyStatus
    start: datetime  # timezone-aware
    end: datetime  # timezone-aware
    leg_index: Optional[int]  # None only before any leg position exists (treat as leg 0, minute 0)
    leg_minutes_start: float  # unrounded driving minutes elapsed on the leg
    leg_minutes_end: float
    distance_miles: float
    cumulative_miles: float
    reason: str
    location: Optional[Location] = None
    end_location: Optional[Location] = None
