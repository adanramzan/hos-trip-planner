from rest_framework.decorators import api_view
from rest_framework.response import Response

from services.geocoding_service import autocomplete


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
