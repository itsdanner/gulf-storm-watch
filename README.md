# AlexiaAlert 🌀

Live dashboard for Hurricane Isaias (NHC AL092026) along the Florida Panhandle coast near Miramar Beach / Sandestin.

- Always-on red banner pinned to the top (storm summary + any active NWS alerts)
- Multi-grid live webcams (Sandestin resort cams + nearby Miramar Beach / Destin streams)
- Storm status, track/cone/wind-field map, threat summary (closest approach, est. landfall, TS-wind arrival)
- Storm-surge sample at the site from the NHC surge raster, plus the NHC peak-surge map
- NWS hourly wind / gust / rain chart and NOAA tide-gauge water levels (Pensacola, Panama City)
- NHC cone, wind probabilities, GOES satellite, Windy radar
- Desktop "monitor wall" layout and a mobile-friendly stacked layout

Everything refreshes by itself (alerts 1 min, storm 2 min, tides 6 min, surge/forecast 10 min, images 5 min) and the page reloads when a new version is deployed.

Static site, no build: open `index.html` or run `python3 -m http.server 8000`.

Data comes straight from the browser: NHC ArcGIS services, NWS API, NOAA CO-OPS. The monitored point is a rounded coordinate (`SITE` in `storm.js`); no street address is used. Cameras are third-party and may go offline.
