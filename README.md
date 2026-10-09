# AlexiaAlert 🌀

Live dashboard for Hurricane Isaias (NHC AL092026) along the Florida Panhandle coast near Miramar Beach / Sandestin.

- Always-on red banner pinned to the top (storm summary + any active NWS alerts)
- Multi-grid live webcams (Sandestin resort cams + nearby Miramar Beach / Destin streams)
- Storm status, track/cone/wind-field map, threat summary (closest approach, est. landfall, TS-wind arrival)
- Storm-surge sample at the site from the NHC surge raster, plus the NHC peak-surge map
- NWS hourly wind / gust / rain chart and NOAA tide-gauge water levels (Pensacola, Panama City)
- NHC cone, wind probabilities, GOES satellite, Windy radar
- 📺 TV mode (`tv.html`, opened by the 📺 button): 3×3 cameras, the banner and three live NWS radar loops, built for casting to a Vizio via Chromecast or AirPlay
- Desktop "monitor wall" layout and a mobile-friendly stacked layout

Everything refreshes by itself (alerts 1 min, storm 2 min, tides 6 min, surge/forecast 10 min, images 5 min) and the page reloads when a new version is deployed.

### Putting it on a TV (free, any phone)
Tap 📺 in the header (or open `/tv.html` on the phone), tap **Go full screen**, then:
- **iPhone/iPad:** Control Center → Screen Mirroring → the Vizio (AirPlay).
- **Android:** quick settings → Cast (or Chrome ⋮ → Cast…) → the Vizio (Chromecast built in).
- **Mac/PC:** Chrome ⋮ → Cast… → Sources: *Cast tab* (Vizio/Chromecast only).
- **Roku TV (e.g. Hisense):** Chrome casting doesn't work. Turn on Settings → Apple AirPlay and HomeKit on the TV and use Screen Mirroring from a Mac/iPhone, or Miracast from Android/Windows (TV: Settings → System → Screen mirroring).

This is screen mirroring of the TV page: the phone must stay on and on the same Wi-Fi as the TV. A web page can't be cast without mirroring unless you pay a $5 Google Cast developer fee (custom receiver, doesn't work from iPhones) or run a separate always-on streaming server, so the site doesn't do either. The optional Cast sender button stays hidden unless `CAST_APP_ID` is set in `index.html`.

Static site, no build: open `index.html` or run `python3 -m http.server 8000`.

Data comes straight from the browser: NHC ArcGIS services, NWS API, NOAA CO-OPS. The monitored point is a rounded coordinate (`SITE` in `storm.js`); no street address is used. Cameras are third-party and may go offline.
