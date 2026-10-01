import logging

from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response

from common.errors import LocationNotFound, NoRoute, PlannerError, RoutingTimeout, RoutingUnavailable

log = logging.getLogger(__name__)

PLANNER = {  # class -> (status, code, message)
    NoRoute: (422, "no_route", "No driving route could be found between those locations."),
    RoutingUnavailable: (503, "routing_unavailable", "The routing service is unavailable right now. Please try again shortly."),
    RoutingTimeout: (504, "routing_timeout", "The routing service took too long to respond. Please try again."),
}


def _first(detail):
    """First (field, message) in a nested DRF error detail."""
    field = None
    while isinstance(detail, (dict, list)):
        if isinstance(detail, dict):
            key, detail = next(iter(detail.items()))
            field = field or key
        else:
            detail = detail[0]
    return field, str(detail)


def _error(status, code, message, field=None):
    err = {"code": code, "message": message}
    if field:
        err["field"] = field
    return Response({"error": err}, status=status)


def api_exception_handler(exc, context):
    if isinstance(exc, ValidationError):
        field, message = _first(exc.detail)
        return _error(400, "invalid_input", message, field)
    if isinstance(exc, LocationNotFound):
        name = exc.field.replace("_location", "")
        return _error(422, "location_not_found", "We couldn't find the %s location. Check the spelling or pick a suggestion." % name, exc.field)
    if isinstance(exc, PlannerError) and type(exc) in PLANNER:
        return _error(*PLANNER[type(exc)])
    if isinstance(exc, APIException):  # e.g. malformed JSON, wrong method
        return _error(exc.status_code, "invalid_input" if exc.status_code == 400 else "unexpected", str(exc.detail))
    log.exception("Unexpected error while handling request")
    return _error(500, "unexpected", "Something went wrong on our side. Please try again.")
