import math

from django.utils.dateparse import parse_datetime
from rest_framework import serializers

LOG_FIELDS = ("driver_name", "co_driver_name", "carrier_name", "main_office_address",
              "truck_number", "trailer_number", "shipping_document")
LABEL_MSG = "Enter a location."


class FiniteFloatField(serializers.FloatField):
    def to_internal_value(self, data):
        v = super().to_internal_value(data)
        if not math.isfinite(v):  # NaN/inf slip past min/max comparisons
            self.fail("invalid")
        return v


class LocationSerializer(serializers.Serializer):
    label = serializers.CharField(error_messages={"required": LABEL_MSG, "blank": LABEL_MSG, "null": LABEL_MSG})
    lat = FiniteFloatField(required=False, min_value=-90, max_value=90)
    lng = FiniteFloatField(required=False, min_value=-180, max_value=180)

    def validate(self, d):
        if ("lat" in d) != ("lng" in d):
            raise serializers.ValidationError("Provide both lat and lng, or neither.")
        return d


def _loc(name):
    return LocationSerializer(error_messages={"required": "%s location is required." % name})


class LogDetailsSerializer(serializers.Serializer):
    locals().update({f: serializers.CharField(required=False, allow_blank=True) for f in LOG_FIELDS})


class PlanRequestSerializer(serializers.Serializer):
    current_location = _loc("Current")
    pickup_location = _loc("Pickup")
    dropoff_location = _loc("Dropoff")
    _cycle_msg = "Current cycle used must be between 0 and 70."
    current_cycle_used = FiniteFloatField(
        min_value=0, max_value=70,
        error_messages={"required": _cycle_msg, "invalid": _cycle_msg, "min_value": _cycle_msg, "max_value": _cycle_msg})
    start_datetime = serializers.CharField(required=False)
    log_details = LogDetailsSerializer(required=False, default=dict)

    def validate_start_datetime(self, v):
        try:
            dt = parse_datetime(v)  # ISO 8601, accepts "Z"
        except ValueError:
            dt = None
        if dt is None:
            raise serializers.ValidationError("Start time must be an ISO date-time, e.g. 2026-10-01T08:00:00.")
        return dt  # no offset = wall-clock time at the home terminal (the view attaches the zone)
