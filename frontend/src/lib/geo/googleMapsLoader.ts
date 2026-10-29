/**
 * Client-side loader for the Google Maps JavaScript API with the Places library.
 *
 * Guarantees a single script tag injection and returns a singleton Promise
 * that resolves once window.google.maps and window.google.maps.places are ready.
 */

let mapsPromise: Promise<typeof google> | null = null;

export function getGoogleMapsApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || key.trim() === "" || key.includes("your_google_maps_api_key")) {
    return null;
  }
  return key.trim();
}

export function loadGoogleMapsScript(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only be loaded in a browser environment."));
  }

  // If already loaded and available on window
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (mapsPromise) {
    return mapsPromise;
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(new Error("NO_API_KEY"));
  }

  mapsPromise = new Promise<typeof google>((resolve, reject) => {
    // Check if script element is already in document
    const existingScript = document.getElementById("google-maps-script") as HTMLScriptElement | null;

    const onScriptLoaded = () => {
      if (window.google?.maps?.places) {
        resolve(window.google);
      } else {
        reject(new Error("Google Maps script loaded but 'places' library is missing."));
      }
    };

    if (existingScript) {
      if (window.google?.maps?.places) {
        resolve(window.google);
        return;
      }
      existingScript.addEventListener("load", onScriptLoaded);
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps script.")));
      return;
    }

    // Capture global auth failures from Google Maps
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      console.error("Google Maps authentication failed: check your API key, billing, or domain restrictions.");
    };

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.type = "text/javascript";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;

    script.onload = onScriptLoaded;
    script.onerror = () => {
      mapsPromise = null;
      reject(new Error("Network error loading Google Maps script."));
    };

    document.head.appendChild(script);
  });

  return mapsPromise;
}
