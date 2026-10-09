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

### Putting it on a TV
**Quickest:** open `tv.html` in the Vizio's built-in web browser, or mirror it (Chrome ⋮ → Cast → Sources: *Cast tab*, or Screen Mirroring from a Mac/iPhone).

**True cast, no mirroring (Vizio SmartCast has Chromecast built in):** `tv.html` doubles as a Google Cast *Custom Web Receiver*, so the TV loads the page itself and the sender only acts as a remote. One-time setup:
1. Register at <https://cast.google.com/publish> (one-time $5 fee).
2. Add new application -> **Custom Receiver**, URL: `https://itsdanner.github.io/gulf-storm-watch/tv.html`. Copy the **App ID**.
3. Under *Devices*, add the Vizio's serial number (TV Settings -> System -> System Information) as a test device, then restart the TV (takes ~15 min to activate). Or publish the app to skip this.
4. Put the App ID in `CAST_APP_ID` near the top of `index.html`, commit and push.
5. In Chrome/Edge on a computer or Chrome on Android, open the dashboard and click the cast icon next to 📺.

AirPlay can only send video/audio, not a live web page, so with AirPlay the only option is screen mirroring. iPhone/iPad Safari can't cast web pages.

Static site, no build: open `index.html` or run `python3 -m http.server 8000`.

Data comes straight from the browser: NHC ArcGIS services, NWS API, NOAA CO-OPS. The monitored point is a rounded coordinate (`SITE` in `storm.js`); no street address is used. Cameras are third-party and may go offline.
