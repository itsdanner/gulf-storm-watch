// Live storm data for the dashboard. Everything is fetched straight from the browser:
// NHC ArcGIS map services, NWS API and NOAA CO-OPS all allow cross-origin requests.
// The site point is deliberately rounded (~1 km) and carries no street address.
const SITE = { lat: 30.38, lon: -86.34 };
const BIN = 'AT4'; // NHC bin for Isaias (CurrentStorms.json -> binNumber)
const STORM_ID = 'al092026';
const GRAPHICS_DIR = 'AT' + BIN.slice(2).padStart(2, '0');
const MAPSERVER = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';
const TIDE_STATIONS = [
  { id: '8729840', name: 'Pensacola' },
  { id: '8729108', name: 'Panama City' },
];
const COAST_LAT = 30.32; // Gulf shoreline latitude near the forecast landfall longitude
const EVAC_NOTE = 'Walton County evacuation Zones A, B and C were reported under mandatory evacuation since noon Oct 8 (family note, unverified). Confirm with Walton County Emergency Management.';
const SURGE_LABEL = { 0: 'Not mapped / dry', 1: '< 1 ft', 2: '1–3 ft', 3: '> 3 ft', 4: '> 6 ft', 5: '> 9 ft', 7: 'Levee area', 15: 'High-tide mask' };

const state = { storm: null, layers: null, map: null, mapLayers: [], charts: {}, nextAdvisory: null };

// ─── small helpers ───
const $ = id => document.getElementById(id);
const R_NM = 3440.065;
const rad = d => d * Math.PI / 180;
function distNm(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = deg => COMPASS[Math.round(deg / 22.5) % 16];
const nmToMi = nm => nm * 1.15078;
const ktToMph = kt => Math.round(kt * 1.15078);
function stamp(id) {
  const el = $('stamp-' + id);
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const g = $('lastUpdate');
  if (g) g.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}
function setError(id, msg) {
  const el = $(id);
  if (el) el.innerHTML = `<div class="alerts-loading">${msg}</div>`;
}

// Nearest point on a polyline (local equirectangular projection) -> {distNm, point, segIndex, t}
function nearestOnLine(coords, p) {
  const kx = Math.cos(rad(p.lat)) * 60, ky = 60; // nm per degree
  let best = null;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = [(coords[i][0] - p.lon) * kx, (coords[i][1] - p.lat) * ky];
    const [x2, y2] = [(coords[i + 1][0] - p.lon) * kx, (coords[i + 1][1] - p.lat) * ky];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / len2)) : 0;
    const d = Math.hypot(x1 + t * dx, y1 + t * dy);
    if (!best || d < best.dist) {
      best = { dist: d, segIndex: i, t, point: { lon: coords[i][0] + t * (coords[i + 1][0] - coords[i][0]), lat: coords[i][1] + t * (coords[i + 1][1] - coords[i][1]) } };
    }
  }
  return best;
}

// ─── NHC layer discovery + queries ───
async function resolveLayers() {
  if (state.layers) return state.layers;
  const want = {
    points: `${BIN} Forecast Points`, track: `${BIN} Forecast Track`, cone: `${BIN} Forecast Cone`,
    ww: `${BIN} Watch-Warning`, radii: `${BIN} Forecast Wind Radii`, toa: `${BIN} Most Likely Arrival Time`,
    surgeFoot: `Footprint_Inun_${BIN}`, surgeImg: `Image_Inun_${BIN}`,
  };
  const fallback = { points: 84, track: 85, cone: 86, ww: 87, radii: 94, toa: 98, surgeFoot: 102, surgeImg: 103 };
  try {
    const meta = await getJSON(`${MAPSERVER}?f=json`);
    const ids = {};
    for (const [k, name] of Object.entries(want)) {
      const l = meta.layers.find(x => x.name === name);
      ids[k] = l ? l.id : fallback[k];
    }
    state.layers = ids;
  } catch { state.layers = fallback; }
  return state.layers;
}
const queryLayer = (id, extra = '') =>
  getJSON(`${MAPSERVER}/${id}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson${extra}`);

// ─── Storm card, threat panel, map ───
async function loadStorm() {
  try {
    const L = await resolveLayers();
    const [pts, track, cone, ww, radii, toa] = await Promise.all([
      queryLayer(L.points), queryLayer(L.track), queryLayer(L.cone),
      queryLayer(L.ww), queryLayer(L.radii), queryLayer(L.toa),
    ]);
    const points = pts.features.map(f => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))
      .sort((a, b) => a.tau - b.tau);
    state.storm = { points, track, cone, ww, radii, toa };
    renderStormCard(points);
    renderThreat(points, track, toa);
    renderMap();
    stamp('storm');
  } catch (e) {
    console.error('storm load', e);
    setError('stormCard', 'Could not reach NHC map service. Retrying…');
  }
}

function baseTime(p0) {
  // validtime like "09/1500" = day/hhmm UTC for the advisory's initial position
  const [dd, hhmm] = p0.validtime.split('/');
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), +dd, +hhmm.slice(0, 2), +hhmm.slice(2));
}
const fmtLocal = ms => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' CDT';

function nextAdvisoryText() {
  // NHC issues at 4/10 AM/PM CDT with intermediates every 3 h while watches/warnings are up.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
  const h = +parts.find(p => p.type === 'hour').value % 24, m = +parts.find(p => p.type === 'minute').value;
  const slots = [1, 4, 7, 10, 13, 16, 19, 22];
  const next = slots.find(s => s * 60 > h * 60 + m) ?? slots[0] + 24;
  const hh = next % 24, label = (hh % 12 || 12) + ':00 ' + (hh < 12 ? 'AM' : 'PM');
  const isFull = [4, 10, 16, 22].includes(hh);
  return `~${label} CDT (${isFull ? 'full' : 'intermediate'})`;
}

function renderStormCard(points) {
  const p = points[0];
  const mph = ktToMph(p.maxwind);
  const cat = p.ssnum > 0 ? `${p.ssnum}` : '—';
  const peak = points.reduce((a, b) => (b.maxwind > a.maxwind ? b : a), p);
  $('stormCard').innerHTML = `
    <div class="storm-stat"><div class="storm-stat-label">Category</div>
      <div class="storm-stat-value cat3">${cat} <span class="storm-stat-unit">${p.tcdvlp || ''}</span></div></div>
    <div class="storm-stat"><div class="storm-stat-label">Max Wind</div>
      <div class="storm-stat-value wind">${mph} <span class="storm-stat-unit">mph (${p.maxwind} kt)</span></div></div>
    <div class="storm-stat"><div class="storm-stat-label">Gusts</div>
      <div class="storm-stat-value">${ktToMph(p.gust)} <span class="storm-stat-unit">mph</span></div></div>
    <div class="storm-stat"><div class="storm-stat-label">Pressure</div>
      <div class="storm-stat-value">${p.mslp} <span class="storm-stat-unit">mb</span></div></div>
    <div class="storm-stat"><div class="storm-stat-label">Motion</div>
      <div class="storm-stat-value">${compass(p.tcdir)} <span class="storm-stat-unit">${p.tcspd} kt (${Math.round(p.tcspd * 1.15078)} mph)</span></div></div>
    <div class="storm-stat"><div class="storm-stat-label">Position</div>
      <div class="storm-stat-value" style="font-size:14px">${p.lat.toFixed(1)}N ${Math.abs(p.lon).toFixed(1)}W</div></div>
    <div class="storm-stat"><div class="storm-stat-label">Advisory</div>
      <div class="storm-stat-value" style="font-size:14px">${p.advisnum} <span class="storm-stat-unit">${p.advdate}</span></div></div>
    <div class="storm-stat"><div class="storm-stat-label">Next advisory</div>
      <div class="storm-stat-value" style="font-size:13px">${nextAdvisoryText()}</div></div>
    <div class="storm-stat full-width"><div class="storm-stat-label">Forecast peak</div>
      <div class="storm-stat-value" style="font-size:14px">${ktToMph(peak.maxwind)} mph (${peak.maxwind} kt) at ${peak.datelbl}</div></div>`;

  const cap = `${p.ssnum > 0 ? 'CAT ' + p.ssnum : p.tcdvlp.toUpperCase()} · ${mph} MPH`;
  const hb = $('headerCat'); if (hb) hb.textContent = cap;
  window.STORM_SUMMARY = `HURRICANE ${p.stormname.replace(/^Hurricane /, '').toUpperCase()} · ${cap} · ADVISORY ${p.advisnum}`;
  if (window.refreshTicker) window.refreshTicker();
}

function renderThreat(points, track, toa) {
  const line = track.features[0]?.geometry.coordinates || [];
  const base = baseTime(points[0]);
  const rows = [];
  const near = nearestOnLine(line, SITE);
  if (near) {
    const sideDeg = bearing(near.point, SITE);
    rows.push(['Track closest approach', `${Math.round(near.dist)} nmi (${Math.round(nmToMi(near.dist))} mi) — site is ${compass(sideDeg)} of the track`]);
  }
  // estimated landfall: first forecast-point segment that crosses the Gulf shoreline latitude
  let landfall = null;
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a.lat < COAST_LAT && b.lat >= COAST_LAT) {
      const t = (COAST_LAT - a.lat) / (b.lat - a.lat);
      landfall = { lon: a.lon + t * (b.lon - a.lon), lat: COAST_LAT, ms: base + (a.tau + t * (b.tau - a.tau)) * 3600e3 };
      break;
    }
  }
  if (landfall) {
    const d = distNm(SITE, landfall), br = bearing(SITE, landfall);
    rows.push(['Est. landfall', `${Math.round(d)} nmi (${Math.round(nmToMi(d))} mi) ${compass(br)} of site (bearing ${Math.round(br)}°) — ${fmtLocal(landfall.ms)}`]);
  } else {
    rows.push(['Est. landfall', 'Track does not cross the coast in this forecast']);
  }
  // TS-wind arrival: closest "most likely arrival" contour to the site
  const arr = toa.features
    .filter(f => (f.properties.arrival_time || '').trim())
    .map(f => ({ label: f.properties.arrival_time, d: nearestOnLine(f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.flat() : f.geometry.coordinates, SITE)?.dist ?? 1e9 }))
    .sort((a, b) => a.d - b.d);
  if (arr.length) {
    rows.push(['Tropical-storm winds (≈)', `${arr[0].label} (nearest NHC arrival contour is ${Math.round(arr[0].d)} nmi away)`]);
    rows.push(['All arrival contours', arr.map(a => `${a.label} (${Math.round(a.d)} nmi)`).join(' · ')]);
  }
  rows.push(['Evacuation', EVAC_NOTE]);
  $('threatBody').innerHTML = rows.map(([k, v]) =>
    `<div class="threat-row"><div class="threat-k">${k}</div><div class="threat-v">${v}</div></div>`).join('');
  stamp('threat');
}

function initMap() {
  if (state.map || !window.L) return;
  const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([SITE.lat, SITE.lon], 7);
  const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
  L.tileLayer(`${esri}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 12, attribution: 'Tiles © Esri' }).addTo(map);
  L.tileLayer(`${esri}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 12 }).addTo(map);
  L.circleMarker([SITE.lat, SITE.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#00d4ff', fillOpacity: 1 })
    .addTo(map).bindTooltip('Monitoring site', { permanent: false });
  [25, 50, 100].forEach(nm => L.circle([SITE.lat, SITE.lon], { radius: nm * 1852, color: '#00d4ff', weight: 1, opacity: .35, fill: false, dashArray: '4 6' })
    .addTo(map).bindTooltip(`${nm} nmi`, { sticky: true }));
  state.map = map;
  new ResizeObserver(() => map.invalidateSize()).observe($('map'));
}

function renderMap() {
  initMap();
  const map = state.map, s = state.storm;
  if (!map || !s) return;
  state.mapLayers.forEach(l => map.removeLayer(l));
  state.mapLayers = [];
  const add = l => { l.addTo(map); state.mapLayers.push(l); return l; };

  const cone = add(L.geoJSON(s.cone, { style: { color: '#fff', weight: 1.5, dashArray: '5 4', fillColor: '#fff', fillOpacity: .12 } }));
  const wwColor = { HWR: '#ff2d55', HWA: '#ff8fb1', TWR: '#2f80ff', TWA: '#ffd60a' };
  add(L.geoJSON(s.ww, { style: f => ({ color: wwColor[f.properties.tcww] || '#fff', weight: 6, opacity: .9 }) }));
  const rColor = { 34: '#ffd60a', 50: '#ff9f0a', 64: '#ff3b30' };
  add(L.geoJSON({ type: 'FeatureCollection', features: s.radii.features.filter(f => f.properties.tau === 0) },
    { style: f => ({ color: rColor[f.properties.radii] || '#fff', weight: 1.5, fillOpacity: .15 }) }));
  add(L.geoJSON(s.track, { style: { color: '#00d4ff', weight: 3 } }));
  s.points.forEach(p => add(L.circleMarker([p.lat, p.lon], {
    radius: 5, color: '#000', weight: 1, fillColor: p.maxwind >= 96 ? '#ff3b30' : p.maxwind >= 64 ? '#ff9f0a' : p.maxwind >= 34 ? '#ffd60a' : '#9aa7b5', fillOpacity: 1,
  }).bindTooltip(`${p.datelbl}: ${ktToMph(p.maxwind)} mph (${p.tcdvlp})`)));
  if (!state.fitted) { map.fitBounds(cone.getBounds().extend([SITE.lat, SITE.lon]).pad(0.1)); state.fitted = true; }
}

// ─── Surge: sample NHC Potential Storm Surge Flooding raster around the site ───
function offsetPoint(p, bearingDeg, meters) {
  const dLat = meters * Math.cos(rad(bearingDeg)) / 111320;
  const dLon = meters * Math.sin(rad(bearingDeg)) / (111320 * Math.cos(rad(p.lat)));
  return { lat: p.lat + dLat, lon: p.lon + dLon };
}
async function identifySurge(p, layerIds) {
  const e = 0.01;
  const url = `${MAPSERVER}/identify?geometry=${p.lon},${p.lat}&geometryType=esriGeometryPoint&sr=4326&layers=all:${layerIds}` +
    `&tolerance=1&mapExtent=${p.lon - e},${p.lat - e},${p.lon + e},${p.lat + e}&imageDisplay=400,400,96&returnGeometry=false&f=json`;
  const d = await getJSON(url);
  const img = d.results.find(r => r.layerName?.startsWith('Image_Inun'));
  const foot = d.results.find(r => r.layerName?.startsWith('Footprint_Inun'));
  const v = parseInt(img?.attributes?.['Classify.Pixel Value'], 10);
  return { cls: Number.isFinite(v) ? v : 0, product: foot?.attributes?.name };
}
async function loadSurge() {
  try {
    const L = await resolveLayers();
    const ids = `${L.surgeFoot},${L.surgeImg}`;
    const ring = (m) => Array.from({ length: 8 }, (_, i) => offsetPoint(SITE, i * 45, m));
    const pts = [SITE, ...ring(100), ...ring(250)];
    const res = await Promise.all(pts.map(p => identifySurge(p, ids)));
    const wet = a => a.filter(r => r.cls >= 1 && r.cls <= 5).map(r => r.cls);
    const center = res[0].cls;
    const max100 = Math.max(0, ...wet(res.slice(0, 9)));
    const max250 = Math.max(0, ...wet(res));
    const product = (res.find(r => r.product) || {}).product || 'NHC surge raster';
    const adv = (product.match(/adv(\w+?)_/i) || [])[1] || '?';
    const hist = saveSurgeHistory(adv, center, max250);
    $('surgeBody').innerHTML = `
      <div class="storm-data">
        <div class="storm-stat"><div class="storm-stat-label">At the site</div>
          <div class="storm-stat-value ${center >= 3 ? 'wind' : ''}" style="font-size:15px">${SURGE_LABEL[center] || center}</div></div>
        <div class="storm-stat"><div class="storm-stat-label">Max within 100 m</div>
          <div class="storm-stat-value" style="font-size:15px">${SURGE_LABEL[max100]}</div></div>
        <div class="storm-stat full-width"><div class="storm-stat-label">Max within 250 m</div>
          <div class="storm-stat-value ${max250 >= 3 ? 'wind' : ''}" style="font-size:15px">${SURGE_LABEL[max250]}</div></div>
      </div>
      <div class="surge-note">${product.replace(/_/g, ' ')} · flooding height above ground, 10% exceedance (reasonable worst case).
        “Not mapped” means dry or outside the modeled area, not guaranteed safe. This is a 17-point sample, not a full grid.</div>
      <div class="surge-hist">${hist}</div>`;
    stamp('surge');
  } catch (e) {
    console.error('surge', e);
    setError('surgeBody', 'Surge raster unavailable right now. Retrying…');
  }
}
function saveSurgeHistory(adv, center, max250) {
  let h = {};
  try { h = JSON.parse(localStorage.getItem('surgeHistory') || '{}'); h[adv] = { center, max250, t: Date.now() }; localStorage.setItem('surgeHistory', JSON.stringify(h)); } catch {}
  const keys = Object.keys(h).sort((a, b) => h[a].t - h[b].t);
  return keys.length ? '<b>History on this device:</b> ' + keys.map(k => `Adv ${k}: site ${SURGE_LABEL[h[k].center]}, 250 m max ${SURGE_LABEL[h[k].max250]}`).join(' → ') : '';
}

// ─── NWS hourly forecast ───
async function loadForecast() {
  try {
    if (!state.hourlyUrl) {
      const pt = await getJSON(`https://api.weather.gov/points/${SITE.lat},${SITE.lon}`);
      state.hourlyUrl = pt.properties.forecastHourly;
    }
    const data = await getJSON(state.hourlyUrl);
    const per = data.properties.periods.slice(0, 36);
    const num = s => { const m = String(s || '').match(/\d+/g); return m ? Math.max(...m.map(Number)) : null; };
    const xs = per.map(p => new Date(p.startTime).getTime());
    const wind = per.map(p => num(p.windSpeed)), gust = per.map(p => num(p.windGust)), pop = per.map(p => p.probabilityOfPrecipitation?.value ?? 0);
    const peakW = Math.max(...wind), peakG = Math.max(0, ...gust.filter(Boolean));
    $('forecastSummary').textContent = `Next 36 h: peak sustained ${peakW} mph, ${peakG ? 'peak gust ' + peakG + ' mph' : 'gusts not in the NWS hourly data'}, max rain chance ${Math.max(...pop)}%. ${per[0].shortForecast}.`;
    drawChart('forecastChart', {
      type: 'line',
      data: {
        datasets: [
          { label: 'Wind (mph)', data: xs.map((x, i) => ({ x, y: wind[i] })), borderColor: '#00d4ff', backgroundColor: '#00d4ff', pointRadius: 0, tension: .3, yAxisID: 'y' },
          { label: 'Gust (mph)', data: xs.map((x, i) => ({ x, y: gust[i] })), borderColor: '#ff3b3b', borderDash: [4, 3], pointRadius: 0, tension: .3, spanGaps: true, yAxisID: 'y' },
          { label: 'Rain chance (%)', data: xs.map((x, i) => ({ x, y: pop[i] })), type: 'bar', backgroundColor: '#2f80ff55', yAxisID: 'y2' },
        ],
      },
      options: chartOptions({ y: { title: 'mph' }, y2: { position: 'right', min: 0, max: 100, grid: false, title: '%' } }),
    });
    stamp('forecast');
  } catch (e) {
    console.error('forecast', e);
    $('forecastSummary').textContent = 'NWS hourly forecast unavailable right now. Retrying…';
  }
}

// ─── NOAA CO-OPS water levels ───
async function loadTides() {
  const stamp8 = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const now = new Date(), begin = new Date(now - 30 * 3600e3), end = new Date(+now + 24 * 3600e3);
  const api = (station, product, b, e) => `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=${product}&application=AlexiaAlert&station=${station}` +
    `&begin_date=${encodeURIComponent(stamp8(b))}&end_date=${encodeURIComponent(stamp8(e))}&datum=MLLW&time_zone=gmt&units=english&format=json` + (product === 'predictions' ? '&interval=h' : '');
  const parse = s => new Date(s.replace(' ', 'T') + 'Z').getTime();
  const out = [];
  for (const st of TIDE_STATIONS) {
    try {
      const [obs, pred] = await Promise.all([getJSON(api(st.id, 'water_level', begin, now)), getJSON(api(st.id, 'predictions', begin, end))]);
      const o = (obs.data || []).map(d => ({ x: parse(d.t), y: parseFloat(d.v) })).filter(d => Number.isFinite(d.y));
      const p = (pred.predictions || []).map(d => ({ x: parse(d.t), y: parseFloat(d.v) }));
      let resid = null;
      if (o.length && p.length) {
        const last = o[o.length - 1];
        const near = p.reduce((a, b) => (Math.abs(b.x - last.x) < Math.abs(a.x - last.x) ? b : a));
        resid = last.y - near.y;
      }
      out.push({ st, o, p, resid });
    } catch (e) { console.error('tide', st.name, e); out.push({ st, o: [], p: [], resid: null }); }
  }
  $('tideSummary').innerHTML = out.map(r => {
    const last = r.o[r.o.length - 1];
    return `<div class="tide-row"><b>${r.st.name}</b>: ` + (last
      ? `${last.y.toFixed(2)} ft MLLW${r.resid != null ? ` · <span style="color:${r.resid > 1 ? 'var(--red)' : 'var(--amber)'}">${r.resid >= 0 ? '+' : ''}${r.resid.toFixed(2)} ft vs predicted tide</span>` : ''}`
      : 'no recent data (gauge offline?)') + '</div>';
  }).join('');
  const colors = ['#00d4ff', '#ffaa00'];
  const datasets = [];
  out.forEach((r, i) => {
    datasets.push({ label: `${r.st.name} observed`, data: r.o, borderColor: colors[i], pointRadius: 0, borderWidth: 2, tension: .2 });
    datasets.push({ label: `${r.st.name} predicted`, data: r.p, borderColor: colors[i], borderDash: [4, 4], pointRadius: 0, borderWidth: 1, tension: .3 });
  });
  drawChart('tideChart', { type: 'line', data: { datasets }, options: chartOptions({ y: { title: 'ft MLLW' } }) });
  stamp('tides');
}

// ─── Chart.js plumbing ───
function chartOptions(scales) {
  const base = {
    x: { type: 'linear', ticks: { color: '#8899aa', maxTicksLimit: 6, callback: v => new Date(v).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric' }) }, grid: { color: '#1e2a3a' } },
  };
  for (const [k, v] of Object.entries(scales)) {
    base[k] = { ticks: { color: '#8899aa' }, grid: v.grid === false ? { display: false } : { color: '#1e2a3a' }, title: { display: !!v.title, text: v.title, color: '#8899aa' }, position: v.position, min: v.min, max: v.max };
  }
  return {
    responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'nearest', intersect: false },
    plugins: { legend: { labels: { color: '#e2e8f0', boxWidth: 12, font: { size: 10 } } },
      tooltip: { callbacks: { title: items => new Date(items[0].parsed.x).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' }) } } },
    scales: base,
  };
}
function drawChart(id, cfg) {
  if (!window.Chart) return;
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart($(id), cfg);
}

// ─── NHC / NOAA image cards (robust to a failed load; keeps retrying) ───
const IMAGES = {
  stormTrackImg: () => `https://www.nhc.noaa.gov/storm_graphics/${GRAPHICS_DIR}/${STORM_ID.toUpperCase()}_5day_cone.png`,
  windProbImg: () => `https://www.nhc.noaa.gov/storm_graphics/${GRAPHICS_DIR}/${STORM_ID.toUpperCase()}_wind_probs_34_F120.png`,
  surgeImg: () => `https://www.nhc.noaa.gov/storm_graphics/${GRAPHICS_DIR}/${STORM_ID.toUpperCase()}_peak_surge.png`,
  satelliteImg: () => 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/GEOCOLOR/1250x750.jpg',
};
function refreshImages() {
  for (const [id, urlFn] of Object.entries(IMAGES)) {
    const img = $(id);
    if (!img) continue;
    const next = new Image();
    next.onload = () => { img.src = next.src; img.style.display = ''; const fb = img.nextElementSibling; if (fb && fb.classList.contains('img-error-placeholder')) fb.style.display = 'none'; stamp(id); };
    next.onerror = () => { if (!img.naturalWidth) { img.style.display = 'none'; const fb = img.nextElementSibling; if (fb) fb.style.display = 'flex'; } };
    next.src = `${urlFn()}${urlFn().includes('?') ? '&' : '?'}t=${Date.now()}`;
  }
}

// ─── scheduling, auto-update ───
function startLive() {
  const jobs = [
    [loadStorm, 2 * 60e3], [loadSurge, 10 * 60e3], [loadForecast, 10 * 60e3],
    [loadTides, 6 * 60e3], [refreshImages, 5 * 60e3], [() => window.fetchAlerts && window.fetchAlerts(), 60e3],
  ];
  jobs.forEach(([fn, ms]) => { fn(); setInterval(fn, ms); });
  setInterval(() => { // re-render the "next advisory" clock without refetching
    if (state.storm) renderStormCard(state.storm.points);
  }, 60e3);
  // refresh immediately when the tab/phone wakes up or regains network
  const wake = () => jobs.forEach(([fn]) => fn());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  window.addEventListener('online', wake);
  // camera iframes can stall silently: reload them periodically
  setInterval(() => CamManager.reloadAngelcam(), 30 * 60e3);
  // pick up new deployments of this page without a manual refresh
  let version = null;
  setInterval(async () => {
    try {
      const r = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' });
      const v = r.headers.get('etag') || r.headers.get('last-modified');
      if (v && version && v !== version) location.reload();
      if (v) version = v;
    } catch {}
  }, 5 * 60e3);
}
window.addEventListener('DOMContentLoaded', startLive);
