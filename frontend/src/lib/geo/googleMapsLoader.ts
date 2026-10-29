/**
 * Client-side loader for the Google Maps JavaScript API with the Places library.
 *
 * Guarantees a single script tag injection and returns a singleton Promise
 * that resolves once window.google.maps and window.google.maps.places are ready.
 */

let mapsPromise: Promise<typeof google> | null = null;
let authFailed = false;
const authFailureListeners = new Set<() => void>();

export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  authFailureListeners.add(listener);
  if (authFailed) {
    listener();
  }
  return () => {
    authFailureListeners.delete(listener);
  };
}

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

  // If already loaded and places is available
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
    const finishLoading = async () => {
      try {
        if (!window.google?.maps) {
          throw new Error("window.google.maps is not available after script execution.");
        }

        // Modern Google Maps API allows explicitly importing libraries
        if (typeof window.google.maps.importLibrary === "function") {
          try {
            await Promise.all([
              window.google.maps.importLibrary("places"),
              window.google.maps.importLibrary("maps"),
              window.google.maps.importLibrary("geocoding").catch(() => null),
            ]);
          } catch (importErr) {
            console.warn("importLibrary call encountered error, checking fallback:", importErr);
          }
        }

        if (window.google.maps.places) {
          resolve(window.google);
          return;
        }

        // Poll briefly in case places is finalizing initialization
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (window.google?.maps?.places) {
            clearInterval(interval);
            resolve(window.google);
          } else if (attempts >= 40) {
            clearInterval(interval);
            mapsPromise = null;
            reject(
              new Error(
                "Google Maps script loaded but 'places' library failed to initialize. Ensure 'Places API' is enabled in your Google Cloud Console."
              )
            );
          }
        }, 100);
      } catch (err) {
        mapsPromise = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    // Global callback for Google Maps script
    const callbackName = "__initCivicGoogleMaps";
    (window as unknown as Record<string, unknown>)[callbackName] = () => {
      finishLoading();
    };

    // Capture global auth failures from Google Maps
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      authFailed = true;
      authFailureListeners.forEach((fn) => fn());
      console.error(
        "Google Maps authentication failed: check your API key, billing, or domain restrictions."
      );
    };

    // Check if script element is already in document
    const existingScript = document.getElementById("google-maps-script") as HTMLScriptElement | null;
    if (existingScript) {
      if (window.google?.maps) {
        finishLoading();
      } else {
        existingScript.addEventListener("load", finishLoading);
        existingScript.addEventListener("error", () => {
          mapsPromise = null;
          reject(new Error("Failed to load Google Maps script."));
        });
      }
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.type = "text/javascript";
    // Using callback and libraries=places ensures places is loaded
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;

    script.onerror = () => {
      mapsPromise = null;
      reject(new Error("Network error loading Google Maps script."));
    };

    document.head.appendChild(script);
  });

  return mapsPromise;
}
