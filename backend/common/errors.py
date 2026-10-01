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
