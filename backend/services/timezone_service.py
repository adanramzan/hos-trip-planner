from zoneinfo import ZoneInfo

from timezonefinder import TimezoneFinder

_tf = TimezoneFinder()


def home_timezone(lat, lng):
    return ZoneInfo(_tf.timezone_at(lat=lat, lng=lng) or "UTC")
