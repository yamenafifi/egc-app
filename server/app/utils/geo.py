import math


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points, in meters."""
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def geofence_status(lat: float, lon: float, site: dict) -> tuple[str, float | None]:
    """Returns (status, distance_m) - status is one of
    ClockRecordModel.GEOFENCE_STATUSES. A site with no geofence radius
    configured yet can't be checked - "no_geofence" is a distinct outcome
    from "outside", since it means nothing was actually verified."""
    site_lat, site_lon = site.get("latitude"), site.get("longitude")
    radius = site.get("geofence_radius_m")
    if site_lat is None or site_lon is None or not radius:
        return "no_geofence", None

    distance = haversine_distance_m(lat, lon, site_lat, site_lon)
    return ("inside" if distance <= radius else "outside"), round(distance, 1)
