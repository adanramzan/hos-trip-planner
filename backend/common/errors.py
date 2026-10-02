class PlannerError(Exception):
    """Base class for expected planning failures."""


class LocationNotFound(PlannerError):
    def __init__(self, field):
        super().__init__("Location not found: %s" % field)
        self.field = field  # current_location | pickup_location | dropoff_location


class NoRoute(PlannerError):
    pass


class RoutingUnavailable(PlannerError):
    pass


class RoutingTimeout(PlannerError):
    pass


def provider_reason(r):
    """What OpenRouteService answered, for the user. Built from the response body only:
    the request URL carries the API key and must never be shown."""
    try:
        err = r.json().get("error")
        msg = err.get("message") if isinstance(err, dict) else err
    except (ValueError, AttributeError):
        msg = None
    return "OpenRouteService answered: %s (HTTP %s)." % (msg if isinstance(msg, str) and msg else "request refused", r.status_code)
