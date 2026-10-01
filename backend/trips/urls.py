from django.urls import path

from . import views

urlpatterns = [
    path("trips/plan", views.plan_trip),
    path("health", views.health),
    path("geocode/autocomplete", views.geocode_autocomplete),
    path("geocode/reverse", views.geocode_reverse),
]
