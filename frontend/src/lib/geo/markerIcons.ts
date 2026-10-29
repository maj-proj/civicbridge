/**
 * Custom SVG Map Marker Icons for CivicBridge.
 *
 * Provides dedicated pins for:
 *  - "garbage": Environmental green pin with municipal waste bin glyph
 *  - "pothole": Road-hazard amber pin with asphalt pothole crater and warning motif
 */

export const GARBAGE_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="52" viewBox="0 0 42 52" fill="none">
  <defs>
    <filter id="shadow-g" x="0" y="0" width="42" height="52" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <path d="M21 2C10.5066 2 2 10.5066 2 21C2 33.25 18.5 48.5 20.2 50.05C20.65 50.45 21.35 50.45 21.8 50.05C23.5 48.5 40 33.25 40 21C40 10.5066 31.4934 2 21 2Z" 
        fill="#059669" stroke="#FFFFFF" stroke-width="2.5" filter="url(#shadow-g)"/>
  <circle cx="21" cy="20" r="13" fill="#064E3B"/>
  <g transform="translate(13, 12)" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M2 4h12"/>
    <path d="M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4"/>
    <path d="M3.5 4l.8 9.5a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9L12.5 4"/>
    <line x1="6.5" y1="7" x2="6.5" y2="11"/>
    <line x1="9.5" y1="7" x2="9.5" y2="11"/>
  </g>
</svg>`;

export const POTHOLE_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="52" viewBox="0 0 42 52" fill="none">
  <defs>
    <filter id="shadow-p" x="0" y="0" width="42" height="52" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <path d="M21 2C10.5066 2 2 10.5066 2 21C2 33.25 18.5 48.5 20.2 50.05C20.65 50.45 21.35 50.45 21.8 50.05C23.5 48.5 40 33.25 40 21C40 10.5066 31.4934 2 21 2Z" 
        fill="#EA580C" stroke="#FFFFFF" stroke-width="2.5" filter="url(#shadow-p)"/>
  <circle cx="21" cy="20" r="13" fill="#1E293B"/>
  <g transform="translate(12, 11)">
    <line x1="1" y1="5.5" x2="17" y2="5.5" stroke="#64748B" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 2"/>
    <path d="M3.5 10.5C3.2 8.5 6 7.2 9 7.2C12.5 7.2 15 8.4 14.8 10.2C14.5 12.2 11.8 13.5 8.8 13.5C5.8 13.5 3.8 12.2 3.5 10.5Z" 
          fill="#090D16" stroke="#F59E0B" stroke-width="1.4"/>
    <ellipse cx="8.8" cy="10.8" rx="3.8" ry="1.8" fill="#020617"/>
    <path d="M3.5 8.5L1.5 7M14.5 8.2L16.5 6.8M8.5 13.5L8.5 15.5M5.2 12.8L3.2 14.8M12.5 12.5L15 14.5" 
          stroke="#FDBA74" stroke-width="1.2" stroke-linecap="round"/>
    <polygon points="9,0.5 7.2,4.5 10.8,4.5" fill="#FBBF24" stroke="#D97706" stroke-width="0.8"/>
  </g>
</svg>`;

export function getCustomMarkerIcon(
  googleMaps: typeof google.maps,
  type?: "garbage" | "pothole" | "GARBAGE" | "POTHOLE" | string
): google.maps.Icon {
  const normalized = (type || "").toLowerCase();
  const isPothole = normalized === "pothole";
  const svg = isPothole ? POTHOLE_PIN_SVG : GARBAGE_PIN_SVG;
  const encodedUrl = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);

  return {
    url: encodedUrl,
    scaledSize: new googleMaps.Size(42, 52),
    origin: new googleMaps.Point(0, 0),
    anchor: new googleMaps.Point(21, 50),
  };
}
