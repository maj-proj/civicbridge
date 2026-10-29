import os
from typing import Optional, Dict, Any

import requests

_GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"


def get_place_details(query: str) -> Optional[Dict[str, Any]]:
    """Call the Google Maps *Text Search* API and return the best‑matching place.

    Returns ``None`` if the request fails or no results are found.
    The returned dict contains:

    - ``name`` – human readable place name
    - ``lat``  – latitude (float)
    - ``lng``  – longitude (float)
    - ``place_id`` – Google place identifier (optional, for later use)
    """
    if not _GOOGLE_MAPS_API_KEY:
        return None

    params = {
        "query": query,
        "key": _GOOGLE_MAPS_API_KEY,
        "language": "en",
    }

    try:
        resp = requests.get(_TEXT_SEARCH_URL, params=params, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("results"):
            return None
        best = data["results"][0]
        location = best["geometry"]["location"]
        return {
            "name": best.get("name"),
            "lat": location["lat"],
            "lng": location["lng"],
            "place_id": best.get("place_id"),
        }
    except Exception:
        # Silently swallow network errors – the detection should still work.
        return None

